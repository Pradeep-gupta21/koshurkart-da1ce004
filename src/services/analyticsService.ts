import { supabase } from '@/integrations/supabase/client';

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
    // Get vendor's product IDs
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('vendor_id', vendorId);
    const productIds = (products ?? []).map(p => p.id);

    if (productIds.length === 0) {
      return { productViews: 0, adImpressions: 0, adClicks: 0, conversionRate: '0', salesGrowth: '0', purchases: 0 };
    }

    // Get all events for these products
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

    // Sales growth: compare purchases last 30 days vs prior 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
    const recent = all.filter(e => e.event_type === 'purchase' && new Date(e.created_at) >= thirtyDaysAgo).length;
    const prior = all.filter(e => e.event_type === 'purchase' && new Date(e.created_at) >= sixtyDaysAgo && new Date(e.created_at) < thirtyDaysAgo).length;
    const salesGrowth = prior > 0 ? (((recent - prior) / prior) * 100).toFixed(1) : recent > 0 ? '100' : '0';

    return { productViews, adImpressions, adClicks, conversionRate, salesGrowth, purchases };
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

    // Top vendors by order_items revenue
    const { data: topVendorData } = await supabase
      .from('order_items')
      .select('vendor_id, price, quantity, vendors(store_name)');
    const vendorRevMap: Record<string, { name: string; revenue: number }> = {};
    for (const item of topVendorData ?? []) {
      const vid = (item as any).vendor_id;
      if (!vid) continue;
      if (!vendorRevMap[vid]) vendorRevMap[vid] = { name: (item as any).vendors?.store_name ?? 'Unknown', revenue: 0 };
      vendorRevMap[vid].revenue += Number(item.price) * item.quantity;
    }
    const topVendors = Object.entries(vendorRevMap)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      platformRevenue,
      adRevenue,
      topVendors,
      suspiciousClickCount: suspiciousRes.count ?? 0,
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
