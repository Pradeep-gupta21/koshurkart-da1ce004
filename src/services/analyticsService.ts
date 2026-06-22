import { supabase } from '@/integrations/supabase/client';
import type { TimeRange } from '@/components/analytics/TimeRangeSelector';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getRangeStart(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case 'daily':   return new Date(now.getTime() - 7 * 86400000);   // last 7 days
    case 'weekly':  return new Date(now.getTime() - 8 * 7 * 86400000); // last 8 weeks
    case 'monthly': return new Date(now.getTime() - 12 * 30 * 86400000); // ~12 months
    case 'yearly':  return new Date(now.getFullYear() - 4, 0, 1);   // last 5 years
  }
}

function bucketKey(date: Date, range: TimeRange): string {
  const d = new Date(date);
  switch (range) {
    case 'daily':   return d.toISOString().slice(0, 10);
    case 'weekly': {
      const day = d.getDay();
      const monday = new Date(d.getTime() - ((day === 0 ? 6 : day - 1) * 86400000));
      return monday.toISOString().slice(0, 10);
    }
    case 'monthly': return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    case 'yearly':  return `${d.getFullYear()}`;
  }
}

function generateBuckets(range: TimeRange): string[] {
  const start = getRangeStart(range);
  const now = new Date();
  const buckets: string[] = [];
  const cur = new Date(start);

  while (cur <= now) {
    const key = bucketKey(cur, range);
    if (!buckets.includes(key)) buckets.push(key);
    if (range === 'daily') cur.setDate(cur.getDate() + 1);
    else if (range === 'weekly') cur.setDate(cur.getDate() + 7);
    else if (range === 'monthly') cur.setMonth(cur.getMonth() + 1);
    else cur.setFullYear(cur.getFullYear() + 1);
  }
  return buckets;
}

function fillBuckets<T extends Record<string, any>>(
  buckets: string[],
  data: Map<string, T>,
  defaults: T
): (T & { date: string })[] {
  return buckets.map(b => ({ date: b, ...defaults, ...(data.get(b) || {}) }));
}

/* ------------------------------------------------------------------ */
/*  Vendor chart data                                                  */
/* ------------------------------------------------------------------ */

export interface VendorChartData {
  timeSeries: { date: string; sales: number; views: number; adClicks: number; adImpressions: number }[];
  topProducts: { title: string; revenue: number; units: number }[];
  categoryBreakdown: { category: string; revenue: number }[];
  campaignPerformance: { productTitle: string; impressions: number; clicks: number; conversions: number }[];
}

/* ------------------------------------------------------------------ */
/*  Admin chart data                                                   */
/* ------------------------------------------------------------------ */

export interface AdminChartData {
  revenueSeries: { date: string; revenue: number; orders: number; commission: number }[];
  adRevenueSeries: { date: string; adRevenue: number }[];
  vendorGrowth: { date: string; newVendors: number }[];
  categoryPerformance: { category: string; revenue: number; count: number }[];
  suspiciousTrend: { date: string; count: number }[];
}

/**
 * Build a map of order_id -> commission rate (decimal 0..1) using the
 * actual `commission_percentage` recorded on the payment row at the
 * time of the transaction. Orders without a payment row (or with 0%)
 * get a 0 rate — the dashboard reflects what was actually charged
 * historically, never a synthetic flat rate.
 */
async function buildOrderCommissionRateMap(orderIds?: string[]): Promise<Map<string, number>> {
  let query = supabase
    .from('payments')
    .select('order_id, commission_percentage, created_at')
    .order('created_at', { ascending: false });
  if (orderIds && orderIds.length > 0) query = query.in('order_id', orderIds);
  const { data } = await query;
  const map = new Map<string, number>();
  for (const p of data ?? []) {
    const oid = (p as any).order_id as string | null;
    if (!oid || map.has(oid)) continue; // keep most recent (already ordered desc)
    const pct = Number((p as any).commission_percentage ?? 0);
    map.set(oid, Number.isFinite(pct) ? pct / 100 : 0);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export const analyticsService = {
  /** Track an analytics event via the security-definer function */
  async trackEvent(
    eventType: 'product_view' | 'ad_view' | 'ad_click' | 'purchase' | 'add_to_cart',
    productId?: string,
    campaignId?: string,
    metadata?: Record<string, any>
  ) {
    await supabase.rpc('record_analytics_event', {
      _event_type: eventType,
      _product_id: productId ?? null,
      _campaign_id: campaignId ?? null,
      _metadata: metadata ?? {},
    });
  },

  /** Vendor dashboard: aggregate analytics for vendor's products */
  async getVendorAnalytics(vendorId: string) {
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('vendor_id', vendorId);
    const productIds = (products ?? []).map(p => p.id);

    if (productIds.length === 0) {
      return { productViews: 0, adImpressions: 0, adClicks: 0, conversionRate: '0', salesGrowth: '0', purchases: 0 };
    }

    const { data: events } = await supabase
      .from('analytics_events')
      .select('event_type, created_at')
      .in('product_id', productIds);
    const all = events ?? [];

    const productViews = all.filter(e => e.event_type === 'product_view').length;
    const adImpressions = all.filter(e => e.event_type === 'ad_view').length;
    const adClicks = all.filter(e => e.event_type === 'ad_click').length;
    const purchases = all.filter(e => e.event_type === 'purchase').length;

    const conversionRate = adClicks > 0 ? ((purchases / adClicks) * 100).toFixed(1) : '0';

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
    const recent = all.filter(e => e.event_type === 'purchase' && new Date(e.created_at) >= thirtyDaysAgo).length;
    const prior = all.filter(e => e.event_type === 'purchase' && new Date(e.created_at) >= sixtyDaysAgo && new Date(e.created_at) < thirtyDaysAgo).length;
    const salesGrowth = prior > 0 ? (((recent - prior) / prior) * 100).toFixed(1) : recent > 0 ? '100' : '0';

    return { productViews, adImpressions, adClicks, conversionRate, salesGrowth, purchases };
  },

  /** Vendor chart data with time range */
  async getVendorChartData(vendorId: string, range: TimeRange): Promise<VendorChartData> {
    const rangeStart = getRangeStart(range).toISOString();
    const buckets = generateBuckets(range);

    // Fetch vendor products
    const { data: products } = await supabase
      .from('products')
      .select('id, title, category')
      .eq('vendor_id', vendorId);
    const prods = products ?? [];
    const productIds = prods.map(p => p.id);
    const productMap = Object.fromEntries(prods.map(p => [p.id, p]));

    if (productIds.length === 0) {
      return {
        timeSeries: fillBuckets(buckets, new Map(), { sales: 0, views: 0, adClicks: 0, adImpressions: 0 }),
        topProducts: [],
        categoryBreakdown: [],
        campaignPerformance: [],
      };
    }

    // Fetch order items + analytics events + campaigns in parallel
    const [orderItemsRes, eventsRes, campaignsRes] = await Promise.all([
      supabase.from('order_items').select('product_id, price, quantity, order_id, orders!inner(created_at)')
        .eq('vendor_id', vendorId).gte('orders.created_at', rangeStart),
      supabase.from('analytics_events').select('event_type, product_id, created_at')
        .in('product_id', productIds).gte('created_at', rangeStart),
      supabase.from('ad_campaigns').select('product_id, impressions, clicks, conversions')
        .eq('vendor_id', vendorId),
    ]);

    const orderItems = orderItemsRes.data ?? [];
    const events = eventsRes.data ?? [];
    const campaigns = campaignsRes.data ?? [];

    // Time series
    const tsMap = new Map<string, { sales: number; views: number; adClicks: number; adImpressions: number }>();
    for (const item of orderItems) {
      const orderDate = (item as any).orders?.created_at;
      if (!orderDate) continue;
      const key = bucketKey(new Date(orderDate), range);
      const cur = tsMap.get(key) || { sales: 0, views: 0, adClicks: 0, adImpressions: 0 };
      cur.sales += Number(item.price) * item.quantity;
      tsMap.set(key, cur);
    }
    for (const ev of events) {
      const key = bucketKey(new Date(ev.created_at), range);
      const cur = tsMap.get(key) || { sales: 0, views: 0, adClicks: 0, adImpressions: 0 };
      if (ev.event_type === 'product_view') cur.views++;
      else if (ev.event_type === 'ad_click') cur.adClicks++;
      else if (ev.event_type === 'ad_view') cur.adImpressions++;
      tsMap.set(key, cur);
    }

    // Top products
    const prodRevMap: Record<string, { title: string; revenue: number; units: number }> = {};
    for (const item of orderItems) {
      const pid = item.product_id || 'unknown';
      if (!prodRevMap[pid]) prodRevMap[pid] = { title: productMap[pid]?.title || 'Unknown', revenue: 0, units: 0 };
      prodRevMap[pid].revenue += Number(item.price) * item.quantity;
      prodRevMap[pid].units += item.quantity;
    }
    const topProducts = Object.values(prodRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // Category breakdown
    const catMap: Record<string, number> = {};
    for (const item of orderItems) {
      const cat = productMap[item.product_id || '']?.category || 'Other';
      catMap[cat] = (catMap[cat] || 0) + Number(item.price) * item.quantity;
    }
    const categoryBreakdown = Object.entries(catMap).map(([category, revenue]) => ({ category, revenue })).sort((a, b) => b.revenue - a.revenue);

    // Campaign performance
    const campaignPerformance = campaigns.map(c => ({
      productTitle: productMap[c.product_id]?.title || 'Unknown',
      impressions: c.impressions || 0,
      clicks: c.clicks || 0,
      conversions: c.conversions || 0,
    }));

    return {
      timeSeries: fillBuckets(buckets, tsMap, { sales: 0, views: 0, adClicks: 0, adImpressions: 0 }),
      topProducts,
      categoryBreakdown,
      campaignPerformance,
    };
  },

  /** Admin dashboard: platform-wide analytics */
  async getAdminAnalytics() {
    const [ordersRes, campaignsRes, suspiciousRes] = await Promise.all([
      supabase.from('orders').select('total_amount'),
      supabase.from('ad_campaigns').select('budget, status'),
      supabase.from('suspicious_clicks').select('id', { count: 'exact', head: true }),
    ]);

    const orders = ordersRes.data ?? [];
    const platformRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);

    const campaigns = campaignsRes.data ?? [];
    const adRevenue = campaigns
      .filter((c: any) => c.status === 'approved')
      .reduce((s, c: any) => s + Number(c.budget), 0);

    const { data: topVendorData } = await supabase
      .from('order_items')
      .select('vendor_id, order_id, price, quantity, vendors(store_name)');
    const vendorRevMap: Record<string, { name: string; revenue: number; orderIds: Set<string> }> = {};
    for (const item of topVendorData ?? []) {
      const vid = (item as any).vendor_id;
      if (!vid) continue;
      if (!vendorRevMap[vid]) vendorRevMap[vid] = { name: (item as any).vendors?.store_name ?? 'Unknown', revenue: 0, orderIds: new Set() };
      vendorRevMap[vid].revenue += Number(item.price) * item.quantity;
      if ((item as any).order_id) vendorRevMap[vid].orderIds.add((item as any).order_id);
    }
    const topVendors = Object.entries(vendorRevMap)
      .map(([id, v]) => ({ id, name: v.name, revenue: v.revenue, orders: v.orderIds.size }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      platformRevenue,
      adRevenue,
      topVendors,
      suspiciousClickCount: suspiciousRes.count ?? 0,
    };
  },

  /** Admin chart data with time range */
  async getAdminChartData(range: TimeRange): Promise<AdminChartData> {
    const rangeStart = getRangeStart(range).toISOString();
    const buckets = generateBuckets(range);

    const [ordersRes, campaignsRes, vendorsRes, suspiciousRes, orderItemsRes] = await Promise.all([
      supabase.from('orders').select('total_amount, created_at').gte('created_at', rangeStart),
      supabase.from('ad_campaigns').select('budget, status, created_at').eq('status', 'approved').gte('created_at', rangeStart),
      supabase.from('vendors').select('id, created_at').gte('created_at', rangeStart),
      supabase.from('suspicious_clicks').select('flagged_at').gte('flagged_at', rangeStart),
      supabase.from('order_items').select('price, quantity, product_id, products!inner(category, created_at)').gte('products.created_at', '2000-01-01'),
    ]);

    // Revenue series
    const revMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of ordersRes.data ?? []) {
      const key = bucketKey(new Date(o.created_at), range);
      const cur = revMap.get(key) || { revenue: 0, orders: 0 };
      cur.revenue += Number(o.total_amount);
      cur.orders++;
      revMap.set(key, cur);
    }

    // Ad revenue series
    const adMap = new Map<string, { adRevenue: number }>();
    for (const c of campaignsRes.data ?? []) {
      const key = bucketKey(new Date(c.created_at), range);
      const cur = adMap.get(key) || { adRevenue: 0 };
      cur.adRevenue += Number(c.budget);
      adMap.set(key, cur);
    }

    // Vendor growth
    const vgMap = new Map<string, { newVendors: number }>();
    for (const v of vendorsRes.data ?? []) {
      const key = bucketKey(new Date(v.created_at), range);
      const cur = vgMap.get(key) || { newVendors: 0 };
      cur.newVendors++;
      vgMap.set(key, cur);
    }

    // Category performance (all time from order_items + products)
    const catMap: Record<string, { revenue: number; count: number }> = {};
    for (const item of orderItemsRes.data ?? []) {
      const cat = (item as any).products?.category || 'Other';
      if (!catMap[cat]) catMap[cat] = { revenue: 0, count: 0 };
      catMap[cat].revenue += Number(item.price) * item.quantity;
      catMap[cat].count++;
    }
    const categoryPerformance = Object.entries(catMap)
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // Suspicious trend
    const susMap = new Map<string, { count: number }>();
    for (const s of suspiciousRes.data ?? []) {
      const key = bucketKey(new Date((s as any).flagged_at), range);
      const cur = susMap.get(key) || { count: 0 };
      cur.count++;
      susMap.set(key, cur);
    }

    return {
      revenueSeries: fillBuckets(buckets, revMap, { revenue: 0, orders: 0 }),
      adRevenueSeries: fillBuckets(buckets, adMap, { adRevenue: 0 }),
      vendorGrowth: fillBuckets(buckets, vgMap, { newVendors: 0 }),
      categoryPerformance,
      suspiciousTrend: fillBuckets(buckets, susMap, { count: 0 }),
    };
  },

  /** Admin: get suspicious click details */
  async getSuspiciousClicks() {
    const { data } = await supabase
      .from('suspicious_clicks')
      .select('*, profiles:user_id(name, email)')
      .order('flagged_at', { ascending: false })
      .limit(50);
    return data ?? [];
  },
};
