// Read-only price quote. Server re-prices items from DB so the UI can display
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
// the EXACT amount the user will be charged before they click "Place Order".
// No writes, no stock reservation, no gateway calls.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { calculateOrderAmount } from "../_shared/pricing.ts";

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
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Method not allowed", false), { ...corsHeaders, "Content-Type": "application/json" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await anon.auth.getUser();
  if (userErr || !user) return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });

  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Invalid JSON", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
  if (!parsed.success) {
    return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Invalid input", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
  const { items } = parsed.data;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Rate limit
  const { data: allowed } = await service.rpc("quote_rate_limit", { _user_id: user.id });
  if (allowed === false) {
    return respondWithError(new PaymentError(ErrorCategory.RATE_LIMIT, ERROR_CODES.INTERNAL_ERROR, "Too many quote requests. Please wait a moment.", false), { ...corsHeaders, "Content-Type": "application/json" });
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

  if (prodErr) {
    console.error("[quote-checkout] products query failed", {
      message: prodErr.message,
      code: (prodErr as any).code,
      details: (prodErr as any).details,
      hint: (prodErr as any).hint,
      productIds,
    });
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Failed to load products", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
  if (!products || products.length !== productIds.length) {
    return respondWithError(new PaymentError(ErrorCategory.NOT_FOUND, ERROR_CODES.INTERNAL_ERROR, "One or more products not found", false), { ...corsHeaders, "Content-Type": "application/json" });
  }

  const byId = new Map(products.map((p: any) => [p.id, p]));
  const lines = [];
  const pricingInput: { product_id: string; quantity: number; unit_price: number }[] = [];

  for (const it of items) {
    const p: any = byId.get(it.product_id);
    if (!p) return respondWithError(new PaymentError(ErrorCategory.NOT_FOUND, ERROR_CODES.INTERNAL_ERROR, `Product ${it.product_id} not available`, false), { ...corsHeaders, "Content-Type": "application/json" });
    const available = (p.stock ?? 0) - (p.reserved_stock ?? 0);
    const unit = Number(p.discount_price ?? p.dynamic_price ?? p.price);
    if (!Number.isFinite(unit) || unit <= 0) {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, `Invalid price for "${p.title}"`, false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    pricingInput.push({ product_id: p.id, quantity: it.quantity, unit_price: unit });
    lines.push({
      product_id: p.id,
      title: p.title,
      image: Array.isArray(p.images) && p.images.length ? p.images[0] : "",
      quantity: it.quantity,
      unit_price: unit,
      line_total: Math.round(unit * it.quantity * 100) / 100,
      in_stock: available >= it.quantity,
      available,
      status: p.status,
    });
  }

  const pricing = calculateOrderAmount(pricingInput);
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

  const response: Record<string, unknown> = {
    quote_id: crypto.randomUUID(),
    currency: "INR",
    lines,
    subtotal: pricing.subtotal_inr,
    expires_at: expiresAt,
  };

  if (DEBUG_PRICING) {
    response.debug = {
      lines: pricing.line_breakdown,
      calculatedAmountInr: pricing.subtotal_inr,
      razorpayAmountPaise: pricing.amount_paise,
    };
  }

  return json(response);
});
