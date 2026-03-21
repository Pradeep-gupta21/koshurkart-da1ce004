import { supabase } from '@/integrations/supabase/client';
import { orderService } from './orderService';
import { calculateCommission, platformSettings } from '@/config/platformSettings';

export const paymentService = {
  // ---- Payment record methods ----

  async createPayment(
    userId: string,
    orderId: string,
    amount: number,
    method: string = 'card',
    provider?: string
  ) {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        order_id: orderId,
        amount,
        payment_method: method,
        payment_provider: provider ?? null,
        payment_status: 'pending',
        commission_percentage: platformSettings.commissionPercentage,
        platform_commission: calculateCommission(amount).commission,
        vendor_earnings: calculateCommission(amount).vendorEarnings,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Simulates payment gateway verification.
   * Replace this with real gateway integration (Stripe, Razorpay, etc.) in production.
   */
  async verifyPayment(
    _paymentId: string,
    method: string
  ): Promise<{ success: boolean; transactionId: string | null }> {
    // COD doesn't need verification — stays pending until delivery
    if (method === 'cod') {
      return { success: true, transactionId: null };
    }

    // Simulate gateway processing delay (500-1500ms)
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    // Simulate ~95% success rate
    const success = Math.random() > 0.05;
    const transactionId = success
      ? `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      : null;

    return { success, transactionId };
  },

  /**
   * Full payment orchestrator:
   * 1. Creates payment with pending status
   * 2. Verifies via gateway
   * 3. Syncs payment + order statuses
   */
  async processPayment(
    userId: string,
    orderId: string,
    amount: number,
    method: string
  ): Promise<{ success: boolean; payment: any; transactionId: string | null; error?: string }> {
    // Step 1: Create pending payment
    const payment = await this.createPayment(userId, orderId, amount, method);

    // Step 2: Verify with gateway
    const verification = await this.verifyPayment(payment.id, method);

    if (verification.success) {
      // Step 3a: Success — update payment + order
      const finalStatus = method === 'cod' ? 'pending' : 'success';
      const updatedPayment = await this.updatePaymentStatus(
        payment.id,
        finalStatus,
        verification.transactionId ?? undefined
      );
      await orderService.updateOrderStatus(orderId, {
        payment_status: method === 'cod' ? 'pending' : 'paid',
        order_status: 'confirmed',
      });
      return { success: true, payment: updatedPayment, transactionId: verification.transactionId };
    } else {
      // Step 3b: Failure — update payment + order
      await this.updatePaymentStatus(payment.id, 'failed');
      await orderService.updateOrderStatus(orderId, {
        payment_status: 'failed',
        order_status: 'processing',
      });
      return { success: false, payment, transactionId: null, error: 'Payment verification failed. Please try again.' };
    }
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
