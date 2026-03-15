import { supabase } from '@/integrations/supabase/client';

export const adService = {
  async getVendorCampaigns(vendorId: string) {
    const { data, error } = await supabase
      .from('ad_campaigns')
      .select('*, products(title)')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createCampaign(campaign: {
    vendor_id: string;
    product_id: string;
    placement: string;
    budget: number;
    daily_limit: number;
    start_date: string;
    end_date: string | null;
  }) {
    const { data, error } = await supabase.from('ad_campaigns').insert(campaign).select().single();
    if (error) throw error;
    return data;
  },

  async getPlacements() {
    const { data, error } = await supabase.from('ad_placements').select('*').eq('is_active', true);
    if (error) throw error;
    return data ?? [];
  },

  async getCampaignCount(vendorId: string) {
    const { count, error } = await supabase
      .from('ad_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId);
    if (error) throw error;
    return count ?? 0;
  },

  async getApprovedByPlacement(placement: string) {
    const { data, error } = await supabase
      .from('ad_campaigns')
      .select('*, products(id, title, slug, price, discount_price, images, rating, review_count, category, vendor_id, vendors(store_name))')
      .eq('placement', placement)
      .eq('status', 'approved');
    if (error) throw error;
    return data ?? [];
  },

  async trackImpression(campaignId: string) {
    await supabase.rpc('track_ad_event', { _campaign_id: campaignId, _event_type: 'impression' });
  },

  async trackClick(campaignId: string) {
    await supabase.rpc('track_ad_event', { _campaign_id: campaignId, _event_type: 'click' });
  },
};
