/* SECURITY NOTE: Payment creation and status mutation are server-side only via service_role and webhooks. Client-side payment writes are blocked at the RLS layer. */
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';
import { orderService } from './orderService';
import { fetchPlatformSettings, fetchPaymentMethodSettings, type PaymentMethodSettings } from '@/config/platformSettings';
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

export async function normalizeError(err: unknown): Promise<never> {
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
    if (err && typeof err === 'object') {
      const anyErr = err as any;
      if (anyErr.status) httpStatus = anyErr.status;
      if (anyErr.errorCode) exactErrorCode = anyErr.errorCode;
    }
  }

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
  mode?: 'test' | 'live';
  idempotent?: boolean;
  debug?: import('@/components/checkout/PricingDebugBox').PricingDebug;
}

// In-memory fallback for strict privacy browsers that throw on sessionStorage access
const fallbackIdempotencyKeys = new Map<string, string>();

function getOrCreateIdempotencyKey(
  items: CheckoutItemInput[],
  paymentMethod: string,
  pincode?: string,
  shipping?: { recipient_name: string; recipient_phone?: string; recipient_email?: string; address: string; city?: string; state?: string; pincode: string; notes?: string; [key: string]: any }
): string {
  if (typeof window === 'undefined') return crypto.randomUUID();
  
  const itemsHash = items.map((i) => `${i.product_id}:${i.quantity}`).sort().join('|');
  const shippingHash = shipping 
    ? `${shipping.recipient_name}|${shipping.recipient_phone || ''}|${shipping.recipient_email || ''}|${shipping.address}|${shipping.city || ''}|${shipping.state || ''}|${shipping.pincode}|${shipping.notes || ''}` 
    : (pincode || '');
  
  const hash = `${itemsHash}|${paymentMethod}|${shippingHash}`;
  const storeKey = `checkout_idem:${hash}`;
  
  try {
    const existing = sessionStorage.getItem(storeKey);
    if (existing) return existing;
  } catch (err) {
    if (fallbackIdempotencyKeys.has(storeKey)) {
      return fallbackIdempotencyKeys.get(storeKey)!;
    }
  }
  
  const k = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
  
  try {
    sessionStorage.setItem(storeKey, k);
  } catch (err) {
    fallbackIdempotencyKeys.set(storeKey, k);
  }
  
  return k;
}

function clearIdempotencyKey(
  items: CheckoutItemInput[],
  paymentMethod: string,
  pincode?: string,
  shipping?: { recipient_name: string; recipient_phone?: string; recipient_email?: string; address: string; city?: string; state?: string; pincode: string; notes?: string; [key: string]: any }
) {
  if (typeof window === 'undefined') return;
  const itemsHash = items.map((i) => `${i.product_id}:${i.quantity}`).sort().join('|');
  const shippingHash = shipping 
    ? `${shipping.recipient_name}|${shipping.recipient_phone || ''}|${shipping.recipient_email || ''}|${shipping.address}|${shipping.city || ''}|${shipping.state || ''}|${shipping.pincode}|${shipping.notes || ''}` 
    : (pincode || '');
  const hash = `${itemsHash}|${paymentMethod}|${shippingHash}`;
  const storeKey = `checkout_idem:${hash}`;
  
  try {
    sessionStorage.removeItem(storeKey);
  } catch (err) {
    // Ignore DOMException
  }
  fallbackIdempotencyKeys.delete(storeKey);
}

function applyPagination(query: any, options?: { limit?: number; offset?: number }) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  if (typeof limit !== 'number' || !Number.isInteger(limit)) {
    throw Object.assign(new Error('Pagination limit must be an integer'), { status: 400, errorCode: 'INVALID_PAGINATION' });
  }
  if (!Number.isSafeInteger(limit)) {
    throw Object.assign(new Error('Pagination limit must be a safe integer'), { status: 400, errorCode: 'INVALID_PAGINATION' });
  }
  if (limit < 0) {
    throw Object.assign(new Error('Pagination limit must be a positive integer'), { status: 400, errorCode: 'INVALID_PAGINATION' });
  }
  if (limit === 0) {
    throw Object.assign(new Error('Pagination limit cannot be zero'), { status: 400, errorCode: 'INVALID_PAGINATION' });
  }

  if (typeof offset !== 'number' || !Number.isInteger(offset)) {
    throw Object.assign(new Error('Pagination offset must be an integer'), { status: 400, errorCode: 'INVALID_PAGINATION' });
  }
  if (!Number.isSafeInteger(offset)) {
    throw Object.assign(new Error('Pagination offset must be a safe integer'), { status: 400, errorCode: 'INVALID_PAGINATION' });
  }
  if (offset < 0) {
    throw Object.assign(new Error('Pagination offset must be a non-negative integer'), { status: 400, errorCode: 'INVALID_PAGINATION' });
  }

  return query.range(offset, offset + limit - 1);
}

let razorpayScriptPromise: Promise<boolean> | null = null;

export const paymentService = {
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
    const idempotencyKey = getOrCreateIdempotencyKey(items, paymentMethod, pincode, shipping);

    try {
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
      
      clearIdempotencyKey(items, paymentMethod, pincode, shipping);
      return result;
    } catch (error: any) {
      if (error?.status >= 400 && error?.status < 500) {
        clearIdempotencyKey(items, paymentMethod, pincode, shipping);
      }
      throw error;
    }
  },

  async adminVerifyPayment(paymentId: string, orderId: string, action: 'approve' | 'reject', idempotencyKey?: string) {
    const { data, error } = await supabase.functions.invoke('admin-verify-payment', {
      body: { paymentId, orderId, action, idempotencyKey },
    });
    if (error) await normalizeError(error);
    if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
    return data;
  },

  async confirmRazorpayPayment(
    paymentId: string,
    orderId: string,
    razorpayPaymentId: string,
    razorpayOrderId: string,
    razorpaySignature: string,
    idempotencyKey?: string
  ) {
    return withRetry(
      async () => {
        const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
          body: {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            paymentId,
            orderId,
            idempotencyKey,
          },
        });
    
        if (error) await normalizeError(error);
        if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
    
        return data;
      },
      { scope: 'confirmRazorpayPayment', retries: 3, delaysMs: [0, 800, 2400] }
    );
  },

  loadRazorpayScript(): Promise<boolean> {
    if (razorpayScriptPromise) return razorpayScriptPromise;
    razorpayScriptPromise = new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => {
        script.remove();
        razorpayScriptPromise = null;
        resolve(false);
      };
      document.body.appendChild(script);
    });
    return razorpayScriptPromise;
  },

  async confirmUpiPayment(paymentId: string, orderId: string, proofUrl?: string, idempotencyKey?: string) {
    return withRetry(
      async () => {
        const { data, error } = await supabase.functions.invoke('confirm-upi-payment', {
          body: { paymentId, orderId, proofUrl, idempotencyKey },
        });
        if (error) await normalizeError(error);
        if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
        return data;
      },
      { scope: 'confirmUpiPayment', retries: 3, delaysMs: [0, 800, 2400] }
    );
  },

  async uploadPaymentProof(file: File): Promise<string> {
    if (file.size > 5 * 1024 * 1024) {
      await normalizeError(Object.assign(new Error('File must be smaller than 5MB'), { status: 400, errorCode: 'FILE_TOO_LARGE' }));
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      await normalizeError(Object.assign(new Error('Invalid file type'), { status: 400, errorCode: 'INVALID_FILE_TYPE' }));
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    
    if (authErr) {
      await normalizeError(authErr); 
    }

    if (!user) {
      throw Object.assign(new Error('401 Unauthorized: User must be signed in to upload proofs.'), { 
        status: 401, 
        errorCode: 'UNAUTHORIZED', 
        retryable: false 
      });
    }

    const ext = file.name.split('.').pop() ?? 'png';
    const uuidFallback = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const path = `${user.id}/${Date.now()}-${uuidFallback.split('-')[0]}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('payment-proofs')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    
    if (upErr) {
      const status = (upErr as any).status ?? (upErr as any).statusCode ?? 500;
      await normalizeError(Object.assign(new Error(upErr.message), { status, errorCode: 'UPLOAD_FAILED' }));
    }

    const { data, error: signErr } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(path, 60 * 60);
      
    if (signErr || !data?.signedUrl) {
      let cleanupMsg = '';
      try {
        const { error: cleanupErr } = await supabase.storage.from('payment-proofs').remove([path]);
        if (cleanupErr) {
          cleanupMsg = ` | Cleanup failed: ${cleanupErr.message}`;
        }
      } catch (e: any) {
        cleanupMsg = ` | Cleanup threw exception: ${e.message}`;
      }
      
      const status = signErr ? ((signErr as any).status ?? (signErr as any).statusCode ?? 500) : 500;
      const baseMsg = signErr?.message ?? 'Failed to sign URL';
      
      await normalizeError(Object.assign(new Error(baseMsg + cleanupMsg), { status, errorCode: 'SIGNING_FAILED' }));
    }
    
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

  async getUserPayments(userId: string, options?: { limit?: number; offset?: number }) {
    let query = supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    query = applyPagination(query, options);
      
    const { data, error } = await query;
    if (error) await normalizeError(error);
    return data ?? [];
  },

  async approveReturn(id: string, idempotencyKey: string) {
    const { data, error } = await supabase.functions.invoke("vendor-approve-return", {
      body: { order_item_id: id, idempotency_key: idempotencyKey },
    });
    if (error) await normalizeError(error);
    if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
    return data as { refund_id?: string | null } | null;
  },

  async rejectReturn(id: string, idempotencyKey?: string) {
    const payload: any = { _order_item_id: id };
    if (idempotencyKey) {
      payload._idempotency_key = idempotencyKey;
    }
    const { error } = await supabase.rpc("vendor_reject_return", payload);
    if (error) await normalizeError(error);
  },

  async getReturns(vendorId: string, options?: { limit?: number; offset?: number }) {
    let query = supabase
      .from("order_items")
      .select("id, order_id, title, image, price, quantity, return_status, return_reason, return_description, return_photos, return_requested_at, return_lock_key, updated_at")
      .eq("vendor_id", vendorId)
      .neq("return_status", "none")
      .order("return_requested_at", { ascending: false, nullsFirst: false });
      
    query = applyPagination(query, options);
    
    const { data, error } = await query;
    if (error) await normalizeError(error);
    return data ?? [];
  },

  async getVendorPayouts(vendorId: string, options?: { limit?: number; offset?: number }) {
    let query = supabase
      .from('payouts')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('requested_at', { ascending: false });
      
    query = applyPagination(query, options);
      
    const { data, error } = await query;
    if (error) await normalizeError(error);
    return data ?? [];
  },

  async requestPayout(vendorId: string, amount: number, methodId?: string, idempotencyKey?: string): Promise<PayoutResult> {
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

        if (error) await normalizeError(error);
        if (data?.error) {
          await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
        }

        return {
          ...data,
          httpStatus: 200,
          retryable: false,
        } as PayoutResult;
      },
      {
        scope: 'requestPayout',
        retries: 3,
        delaysMs: [0, 800, 2400],
      },
    );
  },

  async verifyUpiPayment(
    paymentId: string,
    orderId: string,
    action: 'approve' | 'reject',
    options?: { transactionId?: string; note?: string; idempotencyKey?: string }
  ) {
    const { data, error } = await supabase.functions.invoke('verify-upi-payment', {
      body: { paymentId, orderId, action, ...options },
    });
    if (error) await normalizeError(error);
    if (data?.error) await normalizeError(Object.assign(new Error(data.error), { status: 400, errorCode: data.errorCode }));
    return data;
  },

  async getPayoutSummary(vendorId: string) {
    // Rely strictly on the DB RPC for aggregation. Fetch a limited subset of payouts for UI history.
    const [payoutsRes, financialsRes] = await Promise.all([
      supabase.from('payouts').select('*').eq('vendor_id', vendorId).order('requested_at', { ascending: false }).limit(50),
      supabase.rpc('get_vendor_financials', { _vendor_id: vendorId })
    ]);

    if (payoutsRes.error) await normalizeError(payoutsRes.error);
    if (financialsRes.error) await normalizeError(financialsRes.error);

    if (!financialsRes.data || financialsRes.data.length === 0) {
      await normalizeError(Object.assign(new Error('Vendor financials could not be computed.'), { status: 500, errorCode: 'FINANCIALS_UNAVAILABLE' }));
    }

    const payouts = payoutsRes.data ?? [];
    const financials = financialsRes.data[0] as any;
    
    const totalEarnings = Number(financials.total_earnings || 0);
    const withdrawableBalance = Number(financials.withdrawable_balance || 0);
    const adSpend = Number(financials.total_ad_spend || 0);
    const totalPaidOut = Number(financials.total_paid_out || 0);
    const pendingPayouts = Number(financials.pending_payouts || 0);

    // Commission is intentionally unavailable until the future ledger migration
    // unless explicitly provided by the RPC. The backend remains the financial source of truth.
    // Do not fabricate commission by subtracting values on the client.
    const commission = financials.commission != null ? Number(financials.commission) : 0;

    return {
      totalEarnings,
      withdrawableBalance,
      commission,
      adSpend,
      netEarnings: Math.round((totalEarnings - adSpend) * 100) / 100,
      totalPaidOut,
      pendingPayouts,
      available: withdrawableBalance,
      payouts,
    };
  },
};