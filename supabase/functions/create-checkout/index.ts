// create-checkout: single backend source of truth for orders + payments.
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { normalizeRpcError } from "../../../src/shared/rpcErrorNormalizer.ts";
// The client sends only product_ids + quantities. Server re-prices from DB,
// reserves stock, creates order/items/payment, and (for razorpay/upi) creates
// the gateway artifact — all using DB-derived amounts in INR.
//
// Idempotency: clients SHOULD send a stable `idempotency_key` (UUID) per
// checkout attempt. Retries with the same key (e.g. due to network drops)
// return the same order/payment instead of creating duplicates.
// deno-lint-ignore-file no-explicit-any prefer-const no-explicit-any
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  calculateOrderAmount,
  assertAmountConsistency,
  calculateCommissionSplit,
  calculateVendorTransferAmount,
  getVendorCommissionPercentage,
} from "../_shared/pricing.ts";
import { corsHeaders } from "../_shared/cors.ts";

const IS_PRODUCTION = Deno.env.get("ENV") === "production";
const rawDebug = Deno.env.get("DEBUG_PRICING") === "true";
if (IS_PRODUCTION && rawDebug) {
  console.error("[create-checkout] SECURITY WARNING: DEBUG_PRICING is enabled in production — forcing it off.");
}
const effectiveDebugPricing = IS_PRODUCTION ? false : rawDebug;

const ALLOWED_ORIGINS = [
  "https://koshurkart.com",
  "https://www.koshurkart.com",
  "http://localhost:5173",
  "http://localhost:3000",
];
const PRIMARY_ORIGIN = "https://koshurkart.com";

const CORS_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Vary": "Origin",
  };
}

const json = (body: unknown, status = 200, req: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  payment_method: z.enum(["razorpay", "upi", "cod"]),
  shipping_pincode: z.string().regex(/^\d{6}$/).optional(),
  client_quoted_total: z.number().nonnegative().optional(),
  idempotency_key: z.string().min(16).max(64).optional(),
  // Recipient & delivery details — REQUIRED so vendors can fulfill the order.
  shipping: z.object({
    recipient_name: z.string().trim().min(1).max(200),
    recipient_phone: z.string().trim().min(7).max(20),
    recipient_email: z.string().trim().email().max(200).optional().or(z.literal("")),
    address: z.string().trim().min(1).max(500),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().max(120).optional().or(z.literal("")),
    pincode: z.string().trim().regex(/^\d{6}$/),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  }),
});

function modeFromKey(keyId: string | undefined): "test" | "live" {
  return keyId?.startsWith("rzp_live_") ? "live" : "test";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Method not allowed", false), { ...corsHeaders, "Content-Type": "application/json" });

  // ---- Auth ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await anon.auth.getUser();
  if (userErr || !user) return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });

  // ---- Validate body ----
  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Invalid JSON", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
  if (!parsed.success) {
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Invalid input", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
  const { items, payment_method, client_quoted_total, idempotency_key, shipping } = parsed.data;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Razorpay mode signal — surfaced to the client so the UI can show TEST banners.
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  const mode = modeFromKey(keyId);

  // Production sanity check: warn loudly if running on test keys in prod.
  if (Deno.env.get("ENV") === "production" && mode === "test") {
    console.warn("[create-checkout] WARNING: running with TEST Razorpay keys in production");
    await service.from("analytics_events").insert({
      event_type: "payment_config_warning",
      user_id: user.id,
      metadata: { reason: "test_keys_in_production" },
    });
  }

  // ---- Idempotency short-circuit ----
  // If we've already created an order for (user, idempotency_key), return it
  // verbatim. No new stock reservation, no new gateway call.
  if (idempotency_key) {
    const { data: existingOrder } = await service
      .from("orders")
      .select("id, total_amount")
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existingOrder) {
      const { data: existingPayment } = await service
        .from("payments")
        .select("id, payment_method, razorpay_order_id, qr_code_url, upi_id, amount, payment_status")
        .eq("order_id", existingOrder.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingPayment) {
        const total = Number(existingOrder.total_amount);
        const base = {
          orderId: existingOrder.id,
          paymentId: existingPayment.id,
          total,
          method: existingPayment.payment_method,
          idempotent: true,
        };
        if (existingPayment.payment_method === "razorpay" && existingPayment.razorpay_order_id) {
          return json({
            ...base,
            razorpayOrderId: existingPayment.razorpay_order_id,
            keyId,
            mode,
            amountPaise: Math.round(total * 100),
            currency: "INR",
          }, 200, req);
        }
        if (existingPayment.payment_method === "upi") {
          return json({
            ...base,
            qrCodeUrl: existingPayment.qr_code_url,
            merchantUpiId: existingPayment.upi_id,
          }, 200, req);
        }
        return json(base, 200, req);
      }
    }
  }

  // ---- Rate limit (per-user sliding window) ----
  const { data: allowed } = await service.rpc("checkout_rate_limit", { _user_id: user.id });
  if (allowed === false) {
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: "rate_limited" },
    });
    return respondWithError(new PaymentError(ErrorCategory.RATE_LIMIT, ERROR_CODES.INTERNAL_ERROR, "Too many checkout attempts. Please wait a minute.", false), { ...corsHeaders, "Content-Type": "application/json" });
  }

  // Log every attempt for audit + rate-limit accounting.
  await service.from("analytics_events").insert({
    event_type: "checkout_attempt",
    user_id: user.id,
    metadata: { item_count: items.length, payment_method, mode },
  });

  // ---- 1. Re-price from DB (server is the only source of truth) ----
  const productIds = [...new Set(items.map((i) => i.product_id))];
  const { data: products, error: prodErr } = await service
    .from("products")
    .select("id, title, price, discount_price, dynamic_price, stock, reserved_stock, status, vendor_id, images")
    .in("id", productIds);

  if (prodErr) return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Failed to load products", false), { ...corsHeaders, "Content-Type": "application/json" });
  if (!products || products.length !== productIds.length) {
    return respondWithError(new PaymentError(ErrorCategory.NOT_FOUND, ERROR_CODES.INTERNAL_ERROR, "One or more products not found", false), { ...corsHeaders, "Content-Type": "application/json" });
  }

  const byId = new Map(products.map((p: any) => [p.id, p]));
  type Line = {
    product_id: string;
    quantity: number;
    unit_price: number;
    title: string;
    image: string;
    vendor_id: string;
  };
  const lines: Line[] = [];

  for (const it of items) {
    const p: any = byId.get(it.product_id);
    if (!p) return respondWithError(new PaymentError(ErrorCategory.NOT_FOUND, ERROR_CODES.INTERNAL_ERROR, `Product ${it.product_id} not available`, false), { ...corsHeaders, "Content-Type": "application/json" });
    if (p.status !== "active") return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, `Product "${p.title}" is no longer available`, false), { ...corsHeaders, "Content-Type": "application/json" });
    const available = (p.stock ?? 0) - (p.reserved_stock ?? 0);
    if (available < it.quantity) {
      return respondWithError(new PaymentError(ErrorCategory.CONFLICT, ERROR_CODES.INTERNAL_ERROR, `Only ${available} of "${p.title}" in stock`, false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    // Server-chosen price: discount > dynamic > base. Never client.
    const unitPrice = Number(p.discount_price ?? p.dynamic_price ?? p.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, `Invalid price for "${p.title}"`, false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    lines.push({
      product_id: p.id,
      quantity: it.quantity,
      unit_price: unitPrice,
      title: p.title,
      image: Array.isArray(p.images) && p.images.length ? p.images[0] : "",
      vendor_id: p.vendor_id,
    });
  }

  // ---- 2. Reserve stock atomically ----
  const reserved: Array<{ product_id: string; quantity: number }> = [];
  const releaseReserved = async () => {
    for (const r of reserved) {
      try {
        await service.rpc("release_stock", { p_product_id: r.product_id, p_quantity: r.quantity });
      } catch (_) { /* best-effort */ }
    }
  };

  for (const ln of lines) {
    const { error } = await service.rpc("reserve_stock", {
      p_product_id: ln.product_id,
      p_quantity: ln.quantity,
    });
    if (error) {
      await releaseReserved();
      const mappedErr = normalizeRpcError(error);
      return respondWithError(mappedErr, { ...corsHeaders, "Content-Type": "application/json" });
    }
    reserved.push({ product_id: ln.product_id, quantity: ln.quantity });
  }

  // ---- 3. Compute total via shared helper (rupees + paise locked together) ----
  const pricing = calculateOrderAmount(
    lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
  );
  const total = pricing.subtotal_inr;
  const amountPaise = pricing.amount_paise;

  // Hard equality check — rupee total must round-trip exactly to the paise sent
  // to the gateway. Catches any future rounding/currency-conversion regression
  // BEFORE we charge the user.
  const drift = assertAmountConsistency(total, amountPaise);
  if (drift) {
    await releaseReserved();
    await service.from("analytics_events").insert({
      event_type: "amount_assertion_failed",
      user_id: user.id,
      metadata: {
        subtotal_inr: total,
        amount_paise: amountPaise,
        ...drift,
        payment_method,
      },
    });
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Amount mismatch detected. Order not created.", false), { ...corsHeaders, "Content-Type": "application/json" });
  }

  if (total < 1) {
    await releaseReserved();
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: "min_amount", total },
    });
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Order total must be at least ₹1", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
  if (total > 1_000_000) {
    await releaseReserved();
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: "max_amount", total },
    });
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Order total exceeds maximum allowed", false), { ...corsHeaders, "Content-Type": "application/json" });
  }

  // Drift / tampering audit — log if client's quoted total disagrees with server.
  // We never reject on this (server total wins), but we want a paper trail.
  if (
    typeof client_quoted_total === "number" &&
    Math.abs(client_quoted_total - total) > 0.01
  ) {
    console.warn("checkout quote drift", { user: user.id, client: client_quoted_total, server: total });
    await service.from("analytics_events").insert({
      event_type: "checkout_quote_mismatch",
      user_id: user.id,
      metadata: {
        client_quoted_total,
        server_total: total,
        delta: Math.round((client_quoted_total - total) * 100) / 100,
        payment_method,
      },
    });
  }

  // ---- 4. Insert order (with idempotency_key if supplied) ----
  const orderInsert: Record<string, unknown> = {
    user_id: user.id,
    total_amount: total,
    payment_status: "pending",
    order_status: "processing",
  };
  if (idempotency_key) orderInsert.idempotency_key = idempotency_key;
  if (shipping) {
    orderInsert.recipient_name = shipping.recipient_name;
    orderInsert.recipient_phone = shipping.recipient_phone;
    orderInsert.recipient_email = shipping.recipient_email || null;
    orderInsert.shipping_address = shipping.address;
    orderInsert.shipping_city = shipping.city;
    orderInsert.shipping_state = shipping.state || null;
    orderInsert.shipping_pincode = shipping.pincode;
    orderInsert.order_notes = shipping.notes || null;
  }

  let { data: order, error: orderErr } = await service
    .from("orders")
    .insert(orderInsert)
    .select("id")
    .single();

  // Race: another concurrent request with the same idempotency_key won.
  // Re-fetch and return that order's payload.
  if (orderErr && (orderErr as { code?: string }).code === "23505" && idempotency_key) {
    const { data: dup } = await service
      .from("orders")
      .select("id, total_amount")
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();
    if (dup) {
      const { data: dupPay } = await service
        .from("payments")
        .select("id, payment_method, razorpay_order_id, qr_code_url, upi_id")
        .eq("order_id", dup.id)
        .maybeSingle();
      
      await releaseReserved();
      return json({
        orderId: dup.id,
        paymentId: dupPay?.id ?? null,
        total: Number(dup.total_amount),
        method: dupPay?.payment_method ?? payment_method,
        idempotent: true,
        ...(dupPay?.razorpay_order_id
          ? { razorpayOrderId: dupPay.razorpay_order_id, keyId, mode, amountPaise: Math.round(Number(dup.total_amount) * 100), currency: "INR" }
          : {}),
        ...(dupPay?.qr_code_url ? { qrCodeUrl: dupPay.qr_code_url, merchantUpiId: dupPay.upi_id } : {}),
      }, 200, req);
    }
    
    await releaseReserved();
    return respondWithError(new PaymentError(ErrorCategory.CONFLICT, ERROR_CODES.INTERNAL_ERROR, "Duplicate request", false), { ...corsHeaders, "Content-Type": "application/json" });
  }

  if (orderErr || !order) {
    await releaseReserved();
    console.error("order insert failed", orderErr);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Failed to create order", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
  const orderId = order.id;

  // ---- 5. Insert order_items with server prices ----
  const itemRows = lines.map((l) => ({
    order_id: orderId,
    product_id: l.product_id,
    vendor_id: l.vendor_id,
    title: l.title,
    image: l.image,
    quantity: l.quantity,
    price: l.unit_price,
  }));
  const { error: itemsErr } = await service.from("order_items").insert(itemRows);
  if (itemsErr) {
    await releaseReserved();
    console.error("order_items insert failed", itemsErr);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Failed to create order items", false), { ...corsHeaders, "Content-Type": "application/json" });
  }

  // ---- 6. Commission settings ----
  let commissionPct = 0;
  let commissionEnabled = false;
  let merchantUpiId = "merchant@upi";
  let merchantName = "Marketplace";
  try {
    const { data: settings } = await service
      .from("platform_settings")
      .select("key, value")
      .in("key", ["commission", "payment_methods"]);
    for (const row of settings ?? []) {
      if (row.key === "commission") {
        commissionEnabled = (row.value as any)?.enabled ?? false;
        commissionPct = Number((row.value as any)?.percentage ?? 0);
      } else if (row.key === "payment_methods") {
        merchantUpiId = (row.value as any)?.merchantUpiId ?? merchantUpiId;
        merchantName = (row.value as any)?.merchantName ?? merchantName;
      }
    }
  } catch (_) { /* defaults */ }

  // Platform commission setting, in the shape getVendorCommissionPercentage
  // expects. That helper is the single place that decides the rate a vendor
  // pays — both the recorded payment split and the Route transfers below defer
  // to it, so they can never derive from two independently-maintained numbers.
  const platformSettings = { commission: { enabled: commissionEnabled, percentage: commissionPct } };

  // Per-vendor subtotal in integer paise, using the same per-line rounding as
  // calculateOrderAmount so the vendor parts sum back to amountPaise exactly.
  // Computed once here and reused for the Route transfers[] split.
  const vendorPaise = new Map<string, number>();
  for (const l of lines) {
    if (!l.vendor_id) continue;
    const linePaise = Math.round(l.unit_price * l.quantity * 100);
    vendorPaise.set(l.vendor_id, (vendorPaise.get(l.vendor_id) ?? 0) + linePaise);
  }

  // Resolve each vendor's exemption flag so getVendorCommissionPercentage can
  // decide the rate (exempt vendors — influencer partners — pay 0%).
  const commissionVendorIds = [...vendorPaise.keys()];
  const vendorInfo = new Map<string, { id: string; is_commission_exempt: boolean }>();
  if (commissionVendorIds.length > 0) {
    const { data: vendorRows } = await service
      .from("vendors")
      .select("id, is_commission_exempt")
      .in("id", commissionVendorIds);
    for (const v of (vendorRows ?? []) as any[]) {
      vendorInfo.set(v.id, { id: v.id, is_commission_exempt: !!v.is_commission_exempt });
    }
  }

  // Aggregate the per-vendor split via the shared helpers. The rate for each
  // vendor comes solely from getVendorCommissionPercentage (which already folds
  // in exemption), so platform_commission / vendor_earnings recorded on the
  // payment row are the exact sum of the same splits used to build the Route
  // transfers — the recorded numbers and the money actually moved cannot drift.
  let platformCommissionPaise = 0;
  let vendorEarningsPaise = 0;
  for (const [vendorId, subPaise] of vendorPaise) {
    const v = vendorInfo.get(vendorId) ?? { id: vendorId, is_commission_exempt: false };
    const pct = getVendorCommissionPercentage(v, platformSettings);
    const split = calculateCommissionSplit(subPaise, pct, false);
    platformCommissionPaise += split.platformCommissionPaise;
    vendorEarningsPaise += split.vendorSharePaise;
  }
  const commission = platformCommissionPaise / 100;
  const vendorEarnings = vendorEarningsPaise / 100;

  // Headline rate recorded on the payment row = what a non-exempt vendor pays.
  // Routed through the same helper so the enabled/percentage decision lives in
  // exactly one place; per-vendor exemptions are reflected in the amounts above.
  const recordedCommissionPct = getVendorCommissionPercentage(
    { id: "__platform__", is_commission_exempt: false },
    platformSettings,
  );

  // ---- 7. Idempotent payment row ----
  const { data: existingPayment } = await service
    .from("payments")
    .select("*")
    .eq("user_id", user.id)
    .eq("order_id", orderId)
    .in("payment_status", ["pending", "pending_verification"])
    .maybeSingle();

  let payment = existingPayment;
  if (!payment) {
    const { data, error } = await service
      .from("payments")
      .insert({
        user_id: user.id,
        order_id: orderId,
        amount: total,
        payment_method,
        payment_provider: payment_method === "razorpay" ? "razorpay" : null,
        payment_status: "pending",
        commission_percentage: recordedCommissionPct,
        platform_commission: commission,
        vendor_earnings: vendorEarnings,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("payment insert failed", error);
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Failed to create payment record", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    payment = data;
  }

  // ---- 8. Branch by payment method ----
  const debugBlock = effectiveDebugPricing
    ? {
        debug: {
          lines: pricing.line_breakdown,
          calculatedAmountInr: total,
          razorpayAmountPaise: amountPaise,
          mode,
        },
      }
    : {};

  const logSuccess = (method: string, extra: Record<string, unknown> = {}) =>
    service.from("analytics_events").insert({
      event_type: "checkout_succeeded",
      user_id: user.id,
      metadata: { order_id: orderId, total, amount_paise: amountPaise, method, mode, ...extra },
    });

  if (payment_method === "cod") {
    await service.from("orders").update({ order_status: "confirmed" }).eq("id", orderId);
    await logSuccess("cod");
    return json({ orderId, paymentId: payment.id, total, method: "cod", mode, ...debugBlock }, 200, req);
  }

  if (payment_method === "upi") {
    // UPI link `am=` MUST be the same rupee value derived from amountPaise so
    // the QR amount is provably equal to the gateway/order amount.
    const amountForUpi = (amountPaise / 100).toFixed(2);
    const upiLink = `upi://pay?pa=${encodeURIComponent(merchantUpiId)}&pn=${encodeURIComponent(merchantName)}&am=${amountForUpi}&tn=Order-${orderId.slice(0, 8)}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;
    await service.from("payments").update({ qr_code_url: qrCodeUrl, upi_id: merchantUpiId }).eq("id", payment.id);
    await logSuccess("upi");
    return json({ orderId, paymentId: payment.id, total, method: "upi", qrCodeUrl, merchantUpiId, mode, amountPaise, currency: "INR", ...debugBlock }, 200, req);
  }

  // razorpay
  if (!keyId || !keySecret) {
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: "razorpay_not_configured", order_id: orderId },
    });
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Razorpay not configured", false), { ...corsHeaders, "Content-Type": "application/json" });
  }

  const receipt = `ord_${orderId.replace(/-/g, "").slice(0, 32)}`;

  // ---- Razorpay Route split (upfront, on the order) ----
  // Vendor receives (100 - commission)% of their line subtotal; the platform
  // commission share is retained in our merchant account (where Razorpay
  // deducts its processing fees from — never charged to the vendor).
  // Commission-exempt vendors (influencers) get 100% — no admin cut. The rate
  // comes from the SAME getVendorCommissionPercentage helper and the split from
  // the SAME calculateCommissionSplit family as the payments row above (over the
  // same `vendorPaise` map), so the transfer amount is guaranteed equal to the
  // recorded vendor_earnings.
  const transfers: Array<{ account: string; amount: number; currency: string; on_hold: 0 | 1; notes: Record<string, string> }> = [];
  const skippedTransfers: Array<{ vendor_id: string; reason: string; amount_paise: number }> = [];
  if (vendorPaise.size > 0) {
    const vendorIds = [...vendorPaise.keys()];
    const { data: vRows } = await service
      .from("vendors")
      .select("id, razorpay_account_id, store_name, is_commission_exempt")
      .in("id", vendorIds);
    for (const v of (vRows ?? []) as any[]) {
      const subPaise = vendorPaise.get(v.id) ?? 0;
      if (subPaise <= 0) continue;
      if (!v.razorpay_account_id) {
        // Record the payout this vendor would have received, for visibility.
        const owedPaise = calculateVendorTransferAmount(subPaise, getVendorCommissionPercentage(v, platformSettings), false);
        skippedTransfers.push({ vendor_id: v.id, reason: "missing_razorpay_account_id", amount_paise: owedPaise });
        continue;
      }
      const pct = getVendorCommissionPercentage(v, platformSettings);
      const sharePaise = calculateVendorTransferAmount(subPaise, pct, false);
      if (sharePaise < 100) {
        skippedTransfers.push({ vendor_id: v.id, reason: "share_below_min", amount_paise: sharePaise });
        continue;
      }
      transfers.push({
        account: v.razorpay_account_id,
        amount: sharePaise,
        currency: "INR",
        on_hold: 0,
        notes: {
          order_id: orderId,
          vendor_id: v.id,
          vendor_name: v.store_name ?? "",
          commission_exempt: v.is_commission_exempt ? "true" : "false",
        },
      });
    }
  }

  const rpBody: Record<string, unknown> = { amount: amountPaise, currency: "INR", receipt };
  if (transfers.length > 0) rpBody.transfers = transfers;

  let rpOrder;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
      },
      body: JSON.stringify(rpBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!rpRes.ok) {
      const errBody = await rpRes.text();
      let errorCode = "UNKNOWN";
      try {
        const parsed = JSON.parse(errBody);
        errorCode = parsed?.error?.code || errorCode;
      } catch { /* keep default */ }
      throw new Error(`Razorpay API error: ${rpRes.status} ${errorCode} ${errBody}`);
    }
    rpOrder = await rpRes.json();
  } catch (err) {
    const msg = (err as Error).message.toLowerCase();
    const isAbort = (err as Error).name === "AbortError";
    console.error("razorpay order create failed", (err as Error).message);
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: isAbort ? "timeout" : "gateway_error", order_id: orderId },
    });
    if (isAbort) {
      return respondWithError(new PaymentError(ErrorCategory.GATEWAY_ERROR, ERROR_CODES.BAD_GATEWAY, "Payment gateway timed out. Please try again.", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }
    if (msg.includes("rate") || msg.includes("throttle") || msg.includes("429")) {
      return respondWithError(new PaymentError(ErrorCategory.RATE_LIMIT, ERROR_CODES.INTERNAL_ERROR, "Gateway rate limited. Please try again later.", true), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }
    return respondWithError(new PaymentError(ErrorCategory.GATEWAY_ERROR, ERROR_CODES.INTERNAL_ERROR, "Payment gateway unavailable", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
  }

  await service
    .from("payments")
    .update({ razorpay_order_id: rpOrder.id })
    .eq("id", payment.id);
  await logSuccess("razorpay", { razorpay_order_id: rpOrder.id, amount_paise: amountPaise, transfers: transfers.length, skipped_transfers: skippedTransfers });
  if (skippedTransfers.length > 0) {
    console.warn("[create-checkout] vendors skipped from Route split", skippedTransfers);

    // Persist skipped transfers so this otherwise-silent money leak is queryable
    // and an admin can act on it, and flag the payment row. This is best-effort
    // bookkeeping ONLY: the customer's payment has already succeeded, so a
    // failure here must NEVER fail the order — we log and proceed regardless.
    try {
      const issueRows = skippedTransfers.map((s) => ({
        order_id: orderId,
        vendor_id: s.vendor_id,
        reason: s.reason,
        amount_paise: s.amount_paise,
      }));
      const { error: issuesErr } = await service.from("payment_transfer_issues").insert(issueRows);
      if (issuesErr) {
        console.error("[create-checkout] failed to record payment_transfer_issues", issuesErr);
      }
      const { error: flagErr } = await service
        .from("payments")
        .update({ has_transfer_issues: true })
        .eq("id", payment.id);
      if (flagErr) {
        console.error("[create-checkout] failed to set payments.has_transfer_issues", flagErr);
      }
    } catch (e) {
      console.error("[create-checkout] error persisting transfer issues", e);
    }
  }

  return json({
    orderId,
    paymentId: payment.id,
    total,
    method: "razorpay",
    razorpayOrderId: rpOrder.id,
    keyId,
    mode,
    amountPaise,
    currency: "INR",
    ...debugBlock,
  }, 200, req);
});
