import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { validateActionRequest } from "../_shared/validation.ts";
import { normalizeRpcError } from "../../../src/shared/rpcErrorNormalizer.ts";
const ALLOWED_ORIGINS = [
  "https://koshurkart.com",
  "https://www.koshurkart.com",
];
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  paymentId: string;
  orderId: string;
  action: "verify" | "reject";
  transactionId?: string; // required if verify
  note?: string; // required if reject
}

function json(data: any, status = 200, req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Access-Control-Allow-Origin": allowOrigin, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return new Response("ok", {
      headers: { ...corsHeaders, "Access-Control-Allow-Origin": allowOrigin },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE) {
      console.error("[verify-upi-payment] Missing environment variables");
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error occurred.", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.UNAUTHORIZED, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await anon.auth.getUser();
    if (userError || !user) return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.UNAUTHORIZED, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });
    const userId = user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) {
      const mappedErr = normalizeRpcError(roleErr);
      return respondWithError(mappedErr, { ...corsHeaders, "Content-Type": "application/json" });
    }
    if (!isAdmin) return respondWithError(new PaymentError(ErrorCategory.AUTHORIZATION, ERROR_CODES.FORBIDDEN, "Forbidden: admin only", false), { ...corsHeaders, "Content-Type": "application/json" });

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, "Invalid JSON", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const valErr = validateActionRequest(body, true);
    if (valErr) {
      return json(valErr, 400, req);
    }

    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, order_id, payment_method, payment_status")
      .eq("id", body.paymentId)
      .eq("order_id", body.orderId)
      .maybeSingle();

    if (payErr) {
      console.error("[verify-upi-payment] payment DB lookup error", payErr.code, payErr.message);
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error occurred.", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    if (!payment) return respondWithError(new PaymentError(ErrorCategory.NOT_FOUND, ERROR_CODES.NOT_FOUND, "Payment not found", false), { ...corsHeaders, "Content-Type": "application/json" });
    if (payment.payment_method !== "upi") return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, "Not a UPI payment", false), { ...corsHeaders, "Content-Type": "application/json" });

    const { data: result, error: rpcErr } = await admin.rpc("admin_process_payment", {
      p_payment_id: body.paymentId,
      p_admin_id: userId,
      p_action: body.action,
      p_transaction_id: body.transactionId || null,
      p_note: body.note || null,
    });

    if (rpcErr) {
      const mappedErr = normalizeRpcError(rpcErr);
      console.error("[verify-upi-payment] admin_process_payment RPC error:", rpcErr.code, rpcErr.message);
      return respondWithError(mappedErr, { ...corsHeaders, "Content-Type": "application/json" });
    }

    return json({ success: true, ...result }, 200, req);
  } catch (err) {
    console.error("[verify-upi-payment] unexpected error:", (err as Error).message);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error occurred.", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
});
