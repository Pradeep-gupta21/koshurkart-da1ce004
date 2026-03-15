import { supabase } from '@/integrations/supabase/client';

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
    const [payoutsRes, vendorRes] = await Promise.all([
      supabase.from('payouts').select('*').eq('vendor_id', vendorId),
      supabase.from('vendors').select('total_sales').eq('id', vendorId).single(),
    ]);

    const payouts = payoutsRes.data ?? [];
    const totalEarnings = (vendorRes.data?.total_sales ?? 0) * 25.5;
    const totalPaidOut = payouts.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
    const pendingPayouts = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);

    return {
      totalEarnings,
      totalPaidOut,
      pendingPayouts,
      available: Math.max(0, totalEarnings - totalPaidOut - pendingPayouts),
      payouts,
    };
  },
};
