/* SECURITY NOTE: Payment creation and status mutation are server-side only via service_role and webhooks. Client-side payment writes are blocked at the RLS layer. */
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';
import { orderService } from './orderService';
import { calculateCommission, fetchPlatformSettings, fetchPaymentMethodSettings, type PaymentMethodSettings } from '@/config/platformSettings';
import { withRetry } from '@/lib/retry';

/**
 * Normalize a raw Supabase Functions error into a plain Error annotated with
 * { status, errorCode } so that withRetry / the UI can classify it correctly.
 *
 * Why this is necessary:
 *   FunctionsHttpError carries the HTTP status at `err.context.status`, NOT at
 *   `err.status`. withRetry's defaultIsTransient() reads `e.status`, so without
 *   normalization it would always fall through to `return false`, meaning 5xx
 *   gateway errors are never retried and 4xx/5xx are indistinguishable to the UI.
 *
 * Classification:
 *   • FunctionsHttpError 4xx  → status 400, non-transient (business rejection).
 *   • FunctionsHttpError 5xx  → status 503, transient,  errorCode UNCERTAIN_STATE.
 *   • FunctionsRelayError     → status 503, transient,  errorCode UNCERTAIN_STATE
 *     (infrastructure relay failure; request may or may not have reached the DB).
 *   • FunctionsFetchError     → status 503, transient,  errorCode UNCERTAIN_STATE
 *     (network-level failure; same Two-Generals uncertainty).
 *   • Anything else           → re-thrown as-is.
 */
function normalizeFunctionsError(err: unknown): never {
  if (err instanceof FunctionsHttpError) {
    const httpStatus: number = (err.context as { status: number }).status;
    if (httpStatus >= 400 && httpStatus < 500) {
      // Definitive server rejection — funds were NOT touched.
      throw Object.assign(
        new Error(`HTTP ${httpStatus}: ${err.message}`),
        { status: httpStatus },
      );
    }
    // 5xx — server received the request but something went wrong after.
    // State is uncertain; do not claim the payout failed.
    throw Object.assign(
      new Error(err.message),
      { status: 503, errorCode: 'UNCERTAIN_STATE' },
    );
  }

  if (err instanceof FunctionsRelayError || err instanceof FunctionsFetchError) {
    // Infrastructure / network failure. The request may or may not have reached
    // the database. Treat as uncertain so the UI does not falsely claim funds
    // were not deducted.
    throw Object.assign(
      new Error((err as Error).message),
      { status: 503, errorCode: 'UNCERTAIN_STATE' },
    );
  }

  // Not a Supabase Functions error — re-throw untouched.
  throw err;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface CheckoutItemInput {
  product_id: string;
  quantity: number;
}

export interface CheckoutResult {
  orderId: string;
  paymentId: string;
  total: number;
  method: 'cod' | 'upi' | 'razorpay';
  qrCodeUrl?: string;
  merchantUpiId?: string;
  razorpayOrderId?: string;
  keyId?: string;
  amountPaise?: number;
  currency?: string;
  /** "test" or "live" — derived server-side from RAZORPAY_KEY_ID prefix. */
  mode?: 'test' | 'live';
  /** True when the same idempotency_key returned a previously-created order. */
  idempotent?: boolean;
  /** Present only when DEBUG_PRICING=true on the edge function. */
  debug?: import('@/components/checkout/PricingDebugBox').PricingDebug;
}

/** Stable per-attempt idempotency key, persisted in sessionStorage so that
 *  a user double-click or in-flight retry reuses the same key. */
function getOrCreateIdempotencyKey(items: CheckoutItemInput[], paymentMethod: string): string {
  if (typeof window === 'undefined') return crypto.randomUUID();
  // Cart hash makes the key change when the cart changes — preventing a stale
  // key from being reused after the user edits their cart and re-checks out.
  const hash = items
    .map((i) => `${i.product_id}:${i.quantity}`)
    .sort()
    .join('|') + `|${paymentMethod}`;
  const storeKey = `checkout_idem:${hash}`;
  const existing = sessionStorage.getItem(storeKey);
  if (existing) return existing;
  const k = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
  sessionStorage.setItem(storeKey, k);
  return k;
}

/** Clear the cached key (call after a terminal success/failure). */
function clearIdempotencyKey(items: CheckoutItemInput[], paymentMethod: string) {
  if (typeof window === 'undefined') return;
  const hash = items.map((i) => `${i.product_id}:${i.quantity}`).sort().join('|') + `|${paymentMethod}`;
  sessionStorage.removeItem(`checkout_idem:${hash}`);
}

export const paymentService = {
  /**
   * SOURCE OF TRUTH: server re-prices items from DB, reserves stock,
   * creates the order/items/payment and (for razorpay/upi) the gateway artifact.
   * The client never sends prices.
   *
   * Idempotent: a stable per-attempt key is generated and persisted in
   * sessionStorage so retries (network blips, double-clicks) collapse onto
   * the same order. Combined with `withRetry`, transient 5xx/network errors
   * are auto-retried without risk of duplicate orders or charges.
   */
  async startCheckout(
    items: CheckoutItemInput[],
    paymentMethod: 'cod' | 'upi' | 'razorpay',
    pincode?: string,
    clientQuotedTotal?: number,
    shipping?: {
      recipient_name: string;
      recipient_phone: string;
      recipient_email?: string;
      address: string;
      city: string;
      state?: string;
      pincode: string;
      notes?: string;
    },
  ): Promise<CheckoutResult> {
    const idempotencyKey = getOrCreateIdempotencyKey(items, paymentMethod);

    const result = await withRetry(
      async () => {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: {
            items,
            payment_method: paymentMethod,
            shipping_pincode: pincode,
            client_quoted_total: clientQuotedTotal,
            idempotency_key: idempotencyKey,
            shipping,
          },
        });
        if (error) throw error;
        if (data?.error) {
          const e = new Error(data.error) as Error & { status?: number };
          e.status = 400;
          throw e;
        }
        return data as CheckoutResult;
      },
      { scope: 'startCheckout', retries: 3, delaysMs: [0, 600, 1800] },
    );

    // Cart-shape changed → clear stored key after success so a *new* checkout
    // starts fresh. Keep it on failure so the user can retry safely.
    clearIdempotencyKey(items, paymentMethod);
    return result;
  },

  // ---- Payment record methods ----
  // createPayment(), processPayment(), and updatePaymentStatus() removed.
  // Payment creation and status mutation are server-side only (service_role + webhooks).
  // Client-side writes are blocked at the RLS layer.

  /**
   * Admin-only: Verify and approve/reject a payment (UPI, COD, etc).
   * Routes through the `admin-verify-payment` edge function so the status update
   * is server-side validated and securely updates both payment and order.
   */
  async adminVerifyPayment(paymentId: string, orderId: string, action: 'approve' | 'reject') {
    const { data, error } = await supabase.functions.invoke('admin-verify-payment', {
      body: { paymentId, orderId, action },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
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
   * Confirm UPI payment — user clicks "I Have Paid".
   * Routes through the `confirm-upi-payment` edge function so the status update
   * is server-side validated (RLS does not allow user UPDATE on payments).
   */
  async confirmUpiPayment(paymentId: string, orderId: string, proofUrl?: string) {
    const { data, error } = await supabase.functions.invoke('confirm-upi-payment', {
      body: { paymentId, orderId, proofUrl },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },

  /**
   * Upload payment proof screenshot to the PRIVATE `payment-proofs` bucket.
   * Returns a short-lived signed URL (1 hour). The path is namespaced under
   * the user's id so RLS storage policies grant access to owner + admins only.
   */
  async uploadPaymentProof(file: File): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('payment-proofs')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) throw upErr;

    const { data, error: signErr } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(path, 60 * 60);
    if (signErr || !data?.signedUrl) throw signErr ?? new Error('Failed to sign URL');
    return data.signedUrl;
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

  /**
   * Request a vendor payout via secure Edge Function.
   * The server re-reads the vendor's true withdrawable_balance and validates
   * that the requested amount is > 0 and ≤ balance before inserting the record.
   * Direct client writes to the payouts table are blocked at the RLS layer.
   *
   * @param idempotencyKey - A stable UUID generated by the caller when the payout
   *   flow begins. REQUIRED — callers must supply a non-empty value. The same key
   *   MUST be reused on network-error retries so the RPC can deduplicate and return
   *   the already-created row instead of inserting a duplicate. Generate a fresh
   *   key only after a successful payout, a business-level failure (4xx), or when
   *   the server returns IDEMPOTENCY_TERMINAL (key burned by a failed/cancelled payout).
   *
   * Retry behaviour:
   *   - Network errors and 5xx responses are retried automatically (exponential backoff).
   *   - 4xx business failures (insufficient balance, IDOR, terminal idempotency key)
   *     bubble immediately without retrying — the caller must handle and clear the key.
   */
  async requestPayout(vendorId: string, amount: number, methodId?: string, idempotencyKey?: string) {
    // Strict guard: callers must supply a stable key before invoking this method.
    // An absent or empty key would let the server generate its own (or error), breaking
    // the idempotency contract and potentially causing duplicate fund reservations.
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw Object.assign(
        new Error('requestPayout: idempotencyKey is required and must be a non-empty UUID string.'),
        { status: 400 },
      );
    }

    return withRetry(
      async () => {
        const { data, error } = await supabase.functions.invoke('request-payout', {
          body: { vendorId, amount, methodId, idempotencyKey },
        });

        // Supabase Functions errors carry status at err.context.status, not err.status.
        // normalizeFunctionsError re-throws a plain Error annotated with { status, errorCode }
        // so withRetry's defaultIsTransient() can correctly classify 4xx vs 5xx, and
        // so the UI can detect UNCERTAIN_STATE without inspecting raw Supabase types.
        if (error) normalizeFunctionsError(error);

        // Application-level error in the response body (e.g. IDEMPOTENCY_TERMINAL,
        // Insufficient Funds). The edge function returned HTTP 200 with an error field,
        // meaning the server definitively rejected the request before touching funds.
        // Tag status 400 so withRetry does not retry it.
        if (data?.error) {
          throw Object.assign(new Error(data.error), { status: 400 });
        }

        return data;
      },
      {
        scope: 'requestPayout',
        retries: 3,
        // Exponential backoff: 0 ms on first attempt, 800 ms, 2 400 ms.
        // Only transient (5xx / network) errors are retried; 4xx bubble immediately.
        delaysMs: [0, 800, 2400],
      },
    );
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
    const [payoutsRes, financialsRes, campaignsRes] = await Promise.all([
      supabase.from('payouts').select('*').eq('vendor_id', vendorId),
      supabase.rpc('get_vendor_financials', { _vendor_id: vendorId }),
      supabase.from('ad_campaigns').select('budget').eq('vendor_id', vendorId),
    ]);

    const payouts = payoutsRes.data ?? [];
    const financials = (financialsRes.data?.[0] ?? null) as any;
    const totalEarnings = Number(financials?.total_earnings ?? 0);
    const withdrawableBalance = Number(financials?.withdrawable_balance ?? 0);
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
