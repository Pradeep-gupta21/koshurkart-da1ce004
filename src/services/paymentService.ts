/* SECURITY NOTE: Payment creation and status mutation are server-side only via service_role and webhooks. Client-side payment writes are blocked at the RLS layer. */
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';
import { orderService } from './orderService';
import { calculateCommission, fetchPlatformSettings, fetchPaymentMethodSettings, type PaymentMethodSettings } from '@/config/platformSettings';
import { withRetry } from '@/lib/retry';

export interface PayoutResult {
  httpStatus?: number;
  retryable?: boolean;
  [key: string]: any;
}

export interface NormalizedError extends Error {
  status: number;
  errorCode: string;
  retryable: boolean;
}

const errorCodeMap: Record<string, { message: string; retryable: boolean }> = {
  'MISSING_IDEMPOTENCY_KEY': { message: 'Idempotency key is missing. Please try again.', retryable: false },
  'RAZORPAY_SERVER_ERROR': { message: 'Payment gateway is currently experiencing issues. We will retry.', retryable: true },
  'RAZORPAY_CLIENT_ERROR': { message: 'Invalid payment reference. Please check your details.', retryable: false },
  'CONFLICTING_IDEMPOTENCY_KEY_FORMATS': { message: 'Conflicting idempotency keys provided.', retryable: false },
  'RETURN_NOT_PENDING': { message: 'This return is no longer pending. Please refresh the page.', retryable: false },
  'ROW_LOCKED_BY_ANOTHER_REQUEST': { message: 'Another request is currently processing this item. Please wait and try again.', retryable: true },
  'INVALID_AMOUNT': { message: 'The requested amount is invalid.', retryable: false },
};

/**
 * Shared error normalizer that maps specific Edge Function error codes
 * to standardized client messages, HTTP statuses, and retry logic.
 */
export async function normalizeError(err: unknown): Promise<never> {
  // If already normalized, just re-throw
  if (err && typeof err === 'object' && 'status' in err && 'retryable' in err) {
    throw err;
  }

  let httpStatus = 500;
  let exactMessage = err instanceof Error ? err.message : 'Unknown error';
  let exactErrorCode = 'UNCERTAIN_STATE';
  let retryable = true;

  if (err instanceof FunctionsHttpError) {
    const response = err.context as Response;
    httpStatus = response.status;
    
    try {
      const body = await response.clone().json();
      if (body) {
        if (typeof body.error === 'string') exactMessage = body.error;
        if (typeof body.errorCode === 'string') exactErrorCode = body.errorCode;
      }
    } catch {
      // fallback if not JSON
    }
  } else if (err instanceof FunctionsRelayError || err instanceof FunctionsFetchError) {
    httpStatus = 503;
    exactErrorCode = 'UNCERTAIN_STATE';
    retryable = true;
  } else {
    // Generic errors
    const anyErr = err as any;
    if (anyErr.status) httpStatus = anyErr.status;
    if (anyErr.errorCode) exactErrorCode = anyErr.errorCode;
  }

  // 5xx errors are retryable; 4xx are definitive rejections
  if (httpStatus >= 500) {
    retryable = true;
  } else if (httpStatus >= 400 && httpStatus < 500) {
    retryable = false;
  }

  if (exactErrorCode in errorCodeMap) {
    const override = errorCodeMap[exactErrorCode];
    exactMessage = override.message;
    retryable = override.retryable;
  }

  throw Object.assign(
    new Error(exactMessage),
    { status: httpStatus, errorCode: exactErrorCode, retryable }
  );
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
        if (error) await normalizeError(error);
        if (data?.error) {
          await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
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
    if (error) await normalizeError(error);
    if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
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

    if (error) await normalizeError(error);
    if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));

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
    if (error) await normalizeError(error);
    if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
    return data;
  },

  /**
   * Upload payment proof screenshot to the PRIVATE `payment-proofs` bucket.
   * Returns a short-lived signed URL (1 hour). The path is namespaced under
   * the user's id so RLS storage policies grant access to owner + admins only.
   */
  async uploadPaymentProof(file: File): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) await normalizeError(new Error('Not authenticated'));

    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('payment-proofs')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) await normalizeError(upErr);

    const { data, error: signErr } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(path, 60 * 60);
    if (signErr || !data?.signedUrl) await normalizeError(signErr ?? new Error('Failed to sign URL'));
    return data.signedUrl;
  },

  async getPaymentByOrder(orderId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) await normalizeError(error);
    return data;
  },

  async getUserPayments(userId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) await normalizeError(error);
    return data ?? [];
  },


  async approveReturn(id: string, idempotencyKey: string) {
    const { data, error } = await supabase.functions.invoke("vendor-approve-return", {
      body: JSON.stringify({ order_item_id: id, idempotency_key: idempotencyKey }),
    });
    if (error) await normalizeError(error);
    if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
    return data as { refund_id?: string | null } | null;
  },

  async rejectReturn(id: string) {
    const { error } = await supabase.rpc("vendor_reject_return", { _order_item_id: id });
    if (error) await normalizeError(error);
  },

  async getReturns(vendorId: string) {
    const { data, error } = await supabase
      .from("order_items")
      .select("id, order_id, title, image, price, quantity, return_status, return_reason, return_description, return_photos, return_requested_at, return_lock_key, updated_at")
      .eq("vendor_id", vendorId)
      .neq("return_status", "none")
      .order("return_requested_at", { ascending: false, nullsFirst: false });
    
    if (error) await normalizeError(error);
    return data ?? [];
  },

  // ---- Payout methods ----

  async getVendorPayouts(vendorId: string) {
    const { data, error } = await supabase
      .from('payouts')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('requested_at', { ascending: false });
    if (error) await normalizeError(error);
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
  async requestPayout(vendorId: string, amount: number, methodId?: string, idempotencyKey?: string): Promise<PayoutResult> {
    // Strict guard: callers must supply a stable key before invoking this method.
    // An absent or empty key would let the server generate its own (or error), breaking
    // the idempotency contract and potentially causing duplicate fund reservations.
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      await normalizeError(Object.assign(
        new Error('requestPayout: idempotencyKey is required and must be a non-empty UUID string.'),
        { status: 400, errorCode: 'MISSING_IDEMPOTENCY_KEY' }
      ));
    }

    return withRetry(
      async () => {
        const { data, error } = await supabase.functions.invoke('request-payout', {
          body: { vendorId, amount, methodId, idempotencyKey },
        });

        // Supabase Functions errors carry status at err.context.status, not err.status.
        // normalizeError re-throws a plain Error annotated with { status, errorCode, retryable }
        // so withRetry's defaultIsTransient() can correctly classify 4xx vs 5xx, and
        // so the UI can detect UNCERTAIN_STATE without inspecting raw Supabase types.
        if (error) await normalizeError(error);

        // Application-level error in the response body (e.g. IDEMPOTENCY_TERMINAL,
        // Insufficient Funds). The edge function returned HTTP 200 with an error field,
        // meaning the server definitively rejected the request before touching funds.
        if (data?.error) {
          await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
        }

        // Return a PayoutResult with explicit success HTTP status preserved.
        return {
          ...data,
          httpStatus: 200,
          retryable: false,
        } as PayoutResult;
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
    if (error) await normalizeError(error);
    if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
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
