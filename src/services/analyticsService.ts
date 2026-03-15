import { supabase } from '@/integrations/supabase/client';

export const analyticsService = {
  async getVendorDashboardStats(vendorId: string) {
    const [prodRes, campaignRes, vendorRes] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId),
      supabase.from('ad_campaigns').select('impressions, clicks').eq('vendor_id', vendorId),
      supabase.from('vendors').select('total_sales').eq('id', vendorId).single(),
    ]);

    const campaigns = campaignRes.data ?? [];
    const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions ?? 0), 0);
    const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);

    return {
      products: prodRes.count ?? 0,
      totalSales: vendorRes.data?.total_sales ?? 0,
      totalImpressions,
      totalClicks,
      conversionRate: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0',
    };
  },
};
