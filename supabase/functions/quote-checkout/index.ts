// Read-only price quote. Server re-prices items from DB so the UI can display
// the EXACT amount the user will be charged before they click "Place Order".
// No writes, no stock reservation, no gateway calls.
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
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await anon.auth.getUser();
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!parsed.success) {
    return json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { items } = parsed.data;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate limit
  const { data: allowed } = await service.rpc("quote_rate_limit", { _user_id: user.id });
  if (allowed === false) {
    return json({ error: "Too many quote requests. Please wait a moment." }, 429);
  }

  // Log attempt (best-effort)
  await service.from("analytics_events").insert({
    event_type: "quote_attempt",
    user_id: user.id,
    metadata: { item_count: items.length },
  });

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const { data: products, error: prodErr } = await service
    .from("products")
    .select("id, title, price, discount_price, dynamic_price, stock, reserved_stock, status, images")
    .in("id", productIds);

  if (prodErr) return json({ error: "Failed to load products" }, 500);
  if (!products || products.length !== productIds.length) {
    return json({ error: "One or more products not found" }, 404);
  }

  const byId = new Map(products.map((p: any) => [p.id, p]));
  const lines = [];
  let subtotal = 0;

  for (const it of items) {
    const p: any = byId.get(it.product_id);
    if (!p) return json({ error: `Product ${it.product_id} not available` }, 404);
    const available = (p.stock ?? 0) - (p.reserved_stock ?? 0);
    const unit = Number(p.discount_price ?? p.dynamic_price ?? p.price);
    if (!Number.isFinite(unit) || unit <= 0) {
      return json({ error: `Invalid price for "${p.title}"` }, 500);
    }
    const lineTotal = Math.round(unit * it.quantity * 100) / 100;
    subtotal += lineTotal;
    lines.push({
      product_id: p.id,
      title: p.title,
      image: Array.isArray(p.images) && p.images.length ? p.images[0] : "",
      quantity: it.quantity,
      unit_price: unit,
      line_total: lineTotal,
      in_stock: available >= it.quantity,
      available,
      status: p.status,
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

  return json({
    quote_id: crypto.randomUUID(),
    currency: "INR",
    lines,
    subtotal,
    expires_at: expiresAt,
  });
});
