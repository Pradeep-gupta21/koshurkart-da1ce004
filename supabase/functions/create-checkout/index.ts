// create-checkout: single backend source of truth for orders + payments.
// The client sends only product_ids + quantities. Server re-prices from DB,
// reserves stock, creates order/items/payment, and (for razorpay/upi) creates
// the gateway artifact — all using DB-derived amounts in INR.
//
// Idempotency: clients SHOULD send a stable `idempotency_key` (UUID) per
// checkout attempt. Retries with the same key (e.g. due to network drops)
// return the same order/payment instead of creating duplicates.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { calculateOrderAmount, assertAmountConsistency } from "../_shared/pricing.ts";

const DEBUG_PRICING = Deno.env.get("DEBUG_PRICING") === "true";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ---- Auth ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await anon.auth.getUser();
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  // ---- Validate body ----
  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!parsed.success) {
    return json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, 400);
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
          });
        }
        if (existingPayment.payment_method === "upi") {
          return json({
            ...base,
            qrCodeUrl: existingPayment.qr_code_url,
            merchantUpiId: existingPayment.upi_id,
          });
        }
        return json(base);
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
    return json({ error: "Too many checkout attempts. Please wait a minute." }, 429);
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

  if (prodErr) return json({ error: "Failed to load products" }, 500);
  if (!products || products.length !== productIds.length) {
    return json({ error: "One or more products not found" }, 404);
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
    if (!p) return json({ error: `Product ${it.product_id} not available` }, 404);
    if (p.status !== "active") return json({ error: `Product "${p.title}" is no longer available` }, 410);
    const available = (p.stock ?? 0) - (p.reserved_stock ?? 0);
    if (available < it.quantity) {
      return json({ error: `Only ${available} of "${p.title}" in stock` }, 409);
    }
    // Server-chosen price: discount > dynamic > base. Never client.
    const unitPrice = Number(p.discount_price ?? p.dynamic_price ?? p.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return json({ error: `Invalid price for "${p.title}"` }, 500);
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
      return json({ error: error.message || "Failed to reserve stock" }, 409);
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
    return json(
      { error: "Amount mismatch detected. Order not created.", code: "AMOUNT_MISMATCH" },
      422,
    );
  }

  if (total < 1) {
    await releaseReserved();
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: "min_amount", total },
    });
    return json({ error: "Order total must be at least ₹1" }, 400);
  }
  if (total > 1_000_000) {
    await releaseReserved();
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: "max_amount", total },
    });
    return json({ error: "Order total exceeds maximum allowed" }, 400);
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
    await releaseReserved();
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
      });
    }
    return json({ error: "Duplicate request" }, 409);
  }

  if (orderErr || !order) {
    await releaseReserved();
    console.error("order insert failed", orderErr);
    return json({ error: "Failed to create order" }, 500);
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
    return json({ error: "Failed to create order items" }, 500);
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

  // Per-vendor commission: exempt vendors (influencer partners) get 0% cut and
  // receive 100% of their line subtotal. Non-exempt vendors are charged the
  // active platform commission percentage.
  let commission = 0;
  if (commissionEnabled && commissionPct > 0) {
    const vendorIds = Array.from(new Set(lines.map((l: any) => l.vendor_id).filter(Boolean)));
    let exemptIds = new Set<string>();
    if (vendorIds.length > 0) {
      const { data: vendorRows } = await service
        .from("vendors")
        .select("id, is_commission_exempt")
        .in("id", vendorIds);
      exemptIds = new Set((vendorRows ?? []).filter((v: any) => v.is_commission_exempt).map((v: any) => v.id));
    }
    let chargeableSubtotal = 0;
    for (const l of lines as any[]) {
      if (l.vendor_id && exemptIds.has(l.vendor_id)) continue;
      chargeableSubtotal += Number(l.unit_price) * Number(l.quantity);
    }
    commission = Math.round(chargeableSubtotal * commissionPct) / 100;
  }
  const vendorEarnings = Math.round((total - commission) * 100) / 100;

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
        commission_percentage: commissionPct,
        platform_commission: commission,
        vendor_earnings: vendorEarnings,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("payment insert failed", error);
      return json({ error: "Failed to create payment record" }, 500);
    }
    payment = data;
  }

  // ---- 8. Branch by payment method ----
  const debugBlock = DEBUG_PRICING
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
    return json({ orderId, paymentId: payment.id, total, method: "cod", mode, ...debugBlock });
  }

  if (payment_method === "upi") {
    // UPI link `am=` MUST be the same rupee value derived from amountPaise so
    // the QR amount is provably equal to the gateway/order amount.
    const amountForUpi = (amountPaise / 100).toFixed(2);
    const upiLink = `upi://pay?pa=${encodeURIComponent(merchantUpiId)}&pn=${encodeURIComponent(merchantName)}&am=${amountForUpi}&tn=Order-${orderId.slice(0, 8)}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;
    await service.from("payments").update({ qr_code_url: qrCodeUrl, upi_id: merchantUpiId }).eq("id", payment.id);
    await logSuccess("upi");
    return json({ orderId, paymentId: payment.id, total, method: "upi", qrCodeUrl, merchantUpiId, mode, amountPaise, currency: "INR", ...debugBlock });
  }

  // razorpay
  if (!keyId || !keySecret) {
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: "razorpay_not_configured", order_id: orderId },
    });
    return json({ error: "Razorpay not configured" }, 500);
  }

  const receipt = `ord_${orderId.replace(/-/g, "").slice(0, 32)}`;

  // ---- Razorpay Route split (upfront, on the order) ----
  // 93% → vendor linked account, 7% retained in our merchant account (which
  // is where Razorpay deducts its processing fees from). Commission-exempt
  // vendors (influencers) get 100% — no admin cut.
  const PLATFORM_FEE_PCT = 0.07;
  const vendorPaise = new Map<string, number>();
  for (const l of lines) {
    if (!l.vendor_id) continue;
    const linePaise = Math.round(l.unit_price * l.quantity * 100);
    vendorPaise.set(l.vendor_id, (vendorPaise.get(l.vendor_id) ?? 0) + linePaise);
  }

  const transfers: Array<{ account: string; amount: number; currency: string; on_hold: 0 | 1; notes: Record<string, string> }> = [];
  const skippedTransfers: Array<{ vendor_id: string; reason: string }> = [];
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
        skippedTransfers.push({ vendor_id: v.id, reason: "missing_razorpay_account_id" });
        continue;
      }
      const feePct = v.is_commission_exempt ? 0 : PLATFORM_FEE_PCT;
      const sharePaise = Math.round(subPaise * (1 - feePct));
      if (sharePaise < 100) {
        skippedTransfers.push({ vendor_id: v.id, reason: "share_below_min" });
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

  const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
    },
    body: JSON.stringify(rpBody),
  });
  if (!rpRes.ok) {
    const errBody = await rpRes.text();
    console.error("razorpay order create failed", rpRes.status, errBody);
    await service.from("analytics_events").insert({
      event_type: "checkout_failed",
      user_id: user.id,
      metadata: { reason: "gateway_error", status: rpRes.status, order_id: orderId, body: errBody.slice(0, 500) },
    });
    return json({ error: "Failed to create Razorpay order" }, 502);
  }
  const rpOrder = await rpRes.json();
  await service
    .from("payments")
    .update({ razorpay_order_id: rpOrder.id })
    .eq("id", payment.id);
  await logSuccess("razorpay", { razorpay_order_id: rpOrder.id, amount_paise: amountPaise });

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
  });
});
