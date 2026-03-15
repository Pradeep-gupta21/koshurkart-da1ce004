import { supabase } from '@/integrations/supabase/client';

export const vendorService = {
  async getById(vendorId: string) {
    const { data, error } = await supabase.from('vendors').select('*').eq('id', vendorId).single();
    if (error) throw error;
    return data;
  },

  async getByUserId(userId: string) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async update(vendorId: string, updates: { store_name?: string; description?: string; logo?: string }) {
    const { data, error } = await supabase.from('vendors').update(updates).eq('id', vendorId).select().single();
    if (error) throw error;
    return data;
  },

  async getProductCount(vendorId: string) {
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId);
    if (error) throw error;
    return count ?? 0;
  },

  async getStats(vendorId: string) {
    const [prodRes, campaignRes, vendorRes] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId),
      supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId),
      supabase.from('vendors').select('total_sales').eq('id', vendorId).single(),
    ]);
    return {
      products: prodRes.count ?? 0,
      totalSales: vendorRes.data?.total_sales ?? 0,
      campaigns: campaignRes.count ?? 0,
    };
  },
};
