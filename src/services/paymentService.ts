import { supabase } from '@/integrations/supabase/client';

const COMMISSION_RATE = 0.1;

export const paymentService = {
  // ---- Payment record methods ----

  async createPayment(
    userId: string,
    orderId: string,
    amount: number,
    method: string = 'card',
    provider?: string
  ) {
    const isCod = method === 'cod';
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        order_id: orderId,
        amount,
        payment_method: method,
        payment_provider: provider ?? null,
        payment_status: isCod ? 'pending' : 'success',
        commission_percentage: COMMISSION_RATE * 100,
        platform_commission: amount * COMMISSION_RATE,
        vendor_earnings: amount * (1 - COMMISSION_RATE),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getPaymentByOrder(orderId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getUserPayments(userId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async updatePaymentStatus(paymentId: string, status: string, transactionId?: string) {
    const updates: Record<string, unknown> = { payment_status: status };
    if (transactionId) updates.transaction_id = transactionId;
    const { data, error } = await supabase
      .from('payments')
      .update(updates)
      .eq('id', paymentId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ---- Payout methods ----

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
