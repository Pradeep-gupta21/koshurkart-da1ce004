// create-checkout: single backend source of truth for orders + payments.
// The client sends only product_ids + quantities. Server re-prices from DB,
// reserves stock, creates order/items/payment, and (for razorpay/upi) creates
// the gateway artifact — all using DB-derived amounts in INR.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";

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
  // Optional — what the client *thought* the total was. Used only for
  // tampering/drift telemetry; the server total is always authoritative.
  client_quoted_total: z.number().nonnegative().optional(),
});

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
  const { items, payment_method, client_quoted_total } = parsed.data;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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
    metadata: { item_count: items.length, payment_method },
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

  // ---- 3. Compute total (rounded to 2 dp INR) ----
  const totalRaw = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const total = Math.round(totalRaw * 100) / 100;
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

  // ---- 4. Insert order ----
  const { data: order, error: orderErr } = await service
    .from("orders")
    .insert({
      user_id: user.id,
      total_amount: total,
      payment_status: "pending",
      order_status: "processing",
    })
    .select("id")
    .single();
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

  const commission = commissionEnabled && commissionPct > 0 ? Math.round(total * commissionPct) / 100 : 0;
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
  if (payment_method === "cod") {
    await service.from("orders").update({ order_status: "confirmed" }).eq("id", orderId);
    return json({ orderId, paymentId: payment.id, total, method: "cod" });
  }

  if (payment_method === "upi") {
    const upiLink = `upi://pay?pa=${encodeURIComponent(merchantUpiId)}&pn=${encodeURIComponent(merchantName)}&am=${total}&tn=Order-${orderId.slice(0, 8)}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;
    await service.from("payments").update({ qr_code_url: qrCodeUrl, upi_id: merchantUpiId }).eq("id", payment.id);
    return json({ orderId, paymentId: payment.id, total, method: "upi", qrCodeUrl, merchantUpiId });
  }

  // razorpay
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json({ error: "Razorpay not configured" }, 500);

  const amountPaise = Math.round(total * 100);
  const receipt = `ord_${orderId.replace(/-/g, "").slice(0, 32)}`;

  const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt }),
  });
  if (!rpRes.ok) {
    const errBody = await rpRes.text();
    console.error("razorpay order create failed", rpRes.status, errBody);
    return json({ error: "Failed to create Razorpay order" }, 502);
  }
  const rpOrder = await rpRes.json();
  await service
    .from("payments")
    .update({ razorpay_order_id: rpOrder.id })
    .eq("id", payment.id);

  return json({
    orderId,
    paymentId: payment.id,
    total,
    method: "razorpay",
    razorpayOrderId: rpOrder.id,
    keyId,
    amountPaise,
    currency: "INR",
  });
});
