import { supabase } from '@/integrations/supabase/client';

const COMMISSION_RATE = 0.1;

export const paymentService = {
  async getVendorPayouts(vendorId: string) {
    const { data, error } = await supabase
      .from('payouts')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('requested_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async requestPayout(vendorId: string, amount: number) {
    const { data, error } = await supabase
      .from('payouts')
      .insert({ vendor_id: vendorId, amount })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getPayoutSummary(vendorId: string) {
    const [payoutsRes, orderItemsRes, campaignsRes] = await Promise.all([
      supabase.from('payouts').select('*').eq('vendor_id', vendorId),
      supabase.from('order_items').select('price, quantity').eq('vendor_id', vendorId),
      supabase.from('ad_campaigns').select('budget').eq('vendor_id', vendorId),
    ]);

    const payouts = payoutsRes.data ?? [];
    const totalSales = (orderItemsRes.data ?? []).reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
    const commission = totalSales * COMMISSION_RATE;
    const adSpend = (campaignsRes.data ?? []).reduce((s, c) => s + Number(c.budget), 0);
    const netEarnings = totalSales - commission - adSpend;
    const totalPaidOut = payouts.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
    const pendingPayouts = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);

    return {
      totalSales,
      commission,
      adSpend,
      netEarnings,
      totalPaidOut,
      pendingPayouts,
      available: Math.max(0, netEarnings - totalPaidOut - pendingPayouts),
      payouts,
    };
  },
};
