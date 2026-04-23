import { supabase } from '@/integrations/supabase/client';
import { orderService } from './orderService';
import { calculateCommission, fetchPlatformSettings, fetchPaymentMethodSettings, type PaymentMethodSettings } from '@/config/platformSettings';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export const paymentService = {
  // ---- Payment record methods ----

  async createPayment(
    userId: string,
    orderId: string,
    amount: number,
    method: string = 'card',
    provider?: string,
    upiId?: string
  ) {
    // Fetch live commission settings from DB
    const settings = await fetchPlatformSettings();
    const { commission, vendorEarnings } = calculateCommission(amount, settings);

    const insertData: Record<string, unknown> = {
      user_id: userId,
      order_id: orderId,
      amount,
      payment_method: method,
      payment_provider: provider ?? null,
      payment_status: 'pending',
      commission_percentage: settings.percentage,
      platform_commission: commission,
      vendor_earnings: vendorEarnings,
    };
    if (upiId) insertData.upi_id = upiId;

    const { data, error } = await supabase
      .from('payments')
      .insert(insertData as any)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Full payment orchestrator:
   * 1. Creates payment with pending status
   * 2. Verifies via gateway (or returns UPI QR for manual flow)
   * 3. Syncs payment + order statuses
   */
  async processPayment(
    userId: string,
    orderId: string,
    amount: number,
    method: string,
    upiId?: string
  ): Promise<{
    success: boolean;
    payment: any;
    transactionId: string | null;
    error?: string;
    awaitingUpi?: boolean;
    qrCodeUrl?: string;
    awaitingRazorpay?: boolean;
    razorpayOrderId?: string;
    razorpayKeyId?: string;
  }> {
    // Step 1: Create pending payment
    const provider = method === 'razorpay' ? 'razorpay' : undefined;
    const payment = await this.createPayment(userId, orderId, amount, method, provider, upiId);

    // Fetch payment method settings for merchant details
    const pmSettings = await fetchPaymentMethodSettings();

    // UPI flow: generate QR and return for manual confirmation
    if (method === 'upi') {
      const upiLink = `upi://pay?pa=${encodeURIComponent(pmSettings.merchantUpiId)}&pn=${encodeURIComponent(pmSettings.merchantName)}&am=${amount}&tn=Order-${orderId.slice(0, 8)}&cu=INR`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;

      // Store QR code URL on the payment
      await supabase
        .from('payments')
        .update({ qr_code_url: qrCodeUrl } as any)
        .eq('id', payment.id);

      return {
        success: false,
        awaitingUpi: true,
        payment: { ...payment, qr_code_url: qrCodeUrl },
        transactionId: null,
        qrCodeUrl,
      };
    }

    // COD flow: deterministic success, no gateway needed
    if (method === 'cod') {
      await this.updatePaymentStatus(payment.id, 'pending');
      await orderService.updateOrderStatus(orderId, {
        payment_status: 'pending',
        order_status: 'confirmed',
      });
      return { success: true, payment, transactionId: null };
    }

    // Razorpay flow: create Razorpay order via edge function
    if (method === 'razorpay') {
      try {
        const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
          body: { amount, currency: 'INR', orderId },
        });

        if (error || !data?.razorpayOrderId) {
          await this.updatePaymentStatus(payment.id, 'failed');
          return { success: false, payment, transactionId: null, error: 'Failed to create Razorpay order.' };
        }

        // Store razorpay_order_id on the payment record
        await supabase
          .from('payments')
          .update({ razorpay_order_id: data.razorpayOrderId } as any)
          .eq('id', payment.id);

        return {
          success: false,
          awaitingRazorpay: true,
          payment: { ...payment, razorpay_order_id: data.razorpayOrderId },
          transactionId: null,
          razorpayOrderId: data.razorpayOrderId,
          razorpayKeyId: data.keyId,
        };
      } catch (err: any) {
        await this.updatePaymentStatus(payment.id, 'failed');
        return { success: false, payment, transactionId: null, error: err.message ?? 'Razorpay initialization failed.' };
      }
    }

    // Unsupported method fallback
    return { success: false, payment, transactionId: null, error: 'Unsupported payment method.' };
  },

  /**
   * Confirm Razorpay payment after successful checkout
   */
  async confirmRazorpayPayment(
    paymentId: string,
    orderId: string,
    razorpayPaymentId: string,
    razorpayOrderId: string,
    razorpaySignature: string
  ) {
    const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
      body: {
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        paymentId,
        orderId,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data;
  },

  /**
   * Load Razorpay checkout script dynamically
   */
  loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  },

  /**
   * Confirm UPI payment — user clicks "I Have Paid"
   */
  async confirmUpiPayment(paymentId: string, orderId: string, proofUrl?: string) {
    const updates: Record<string, unknown> = { payment_status: 'pending_verification' };
    if (proofUrl) updates.payment_proof = proofUrl;

    const { data, error } = await supabase
      .from('payments')
      .update(updates as any)
      .eq('id', paymentId)
      .select()
      .single();
    if (error) throw error;

    // Update order to reflect pending verification
    await orderService.updateOrderStatus(orderId, {
      payment_status: 'pending',
      order_status: 'processing',
    });

    return data;
  },

  /**
   * Upload payment proof screenshot
   */
  async uploadPaymentProof(file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `payment-proofs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;

    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
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
    const updates: { payment_status: string; transaction_id?: string } = { payment_status: status };
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

  /**
   * Admin-only: approve or reject a UPI payment via secure edge function.
   * The backend validates the JWT, checks the admin role, updates payment + order
   * statuses, and (on reject) releases reserved stock.
   */
  async verifyUpiPayment(
    paymentId: string,
    orderId: string,
    action: 'approve' | 'reject',
    options?: { transactionId?: string; note?: string }
  ) {
    const { data, error } = await supabase.functions.invoke('verify-upi-payment', {
      body: { paymentId, orderId, action, ...options },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },

  async getPayoutSummary(vendorId: string) {
    const [payoutsRes, vendorRes, campaignsRes] = await Promise.all([
      supabase.from('payouts').select('*').eq('vendor_id', vendorId),
      supabase.from('vendors').select('total_earnings, withdrawable_balance').eq('id', vendorId).single(),
      supabase.from('ad_campaigns').select('budget').eq('vendor_id', vendorId),
    ]);

    const payouts = payoutsRes.data ?? [];
    const totalEarnings = Number(vendorRes.data?.total_earnings ?? 0);
    const withdrawableBalance = Number(vendorRes.data?.withdrawable_balance ?? 0);
    const adSpend = (campaignsRes.data ?? []).reduce((s, c) => s + Number(c.budget), 0);
    const totalPaidOut = payouts.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
    const pendingPayouts = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);

    return {
      totalEarnings,
      withdrawableBalance,
      commission: 0,
      adSpend,
      netEarnings: totalEarnings - adSpend,
      totalPaidOut,
      pendingPayouts,
      available: withdrawableBalance,
      payouts,
    };
  },
};
