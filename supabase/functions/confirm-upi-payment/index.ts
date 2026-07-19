// User-authenticated UPI confirmation. Replaces the client-side update that
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
// failed silently due to RLS (no user UPDATE policy on payments).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: uerr } = await anon.auth.getUser();
    if (uerr || !user) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const body = await req.json().catch(() => ({}));
    const { paymentId, orderId, proofUrl } = body as {
      paymentId?: string;
      orderId?: string;
      proofUrl?: string;
    };

    if (!paymentId || !orderId) {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "paymentId and orderId required", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    // Validate proofUrl: must be a Supabase Storage URL for the payment-proofs bucket.
    if (proofUrl !== undefined && proofUrl !== null && proofUrl !== "") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const allowedPrefix = `${supabaseUrl}/storage/v1/object/`;
      let ok = false;
      try {
        const u = new URL(proofUrl);
        ok =
          (u.protocol === "https:" || u.protocol === "http:") &&
          proofUrl.startsWith(allowedPrefix) &&
          u.pathname.includes("/payment-proofs/");
      } catch {
        ok = false;
      }
      if (!ok) {
        return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Invalid proofUrl", false), { ...corsHeaders, "Content-Type": "application/json" });
      }
    }


    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment, error: fErr } = await service
      .from("payments")
      .select("id, user_id, order_id, payment_method, payment_status")
      .eq("id", paymentId)
      .maybeSingle();

    if (fErr || !payment) {
      return respondWithError(new PaymentError(ErrorCategory.NOT_FOUND, ERROR_CODES.INTERNAL_ERROR, "Payment not found", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    if (payment.user_id !== user.id) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHORIZATION, ERROR_CODES.INTERNAL_ERROR, "Forbidden", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    if (payment.order_id !== orderId) {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Order mismatch", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    if (payment.payment_method !== "upi") {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Not a UPI payment", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    if (payment.payment_status === "success") {
      return new Response(JSON.stringify({ ok: true, idempotent: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, unknown> = { payment_status: "pending_verification" };
    if (proofUrl) updates.payment_proof = proofUrl;

    const { error: upErr } = await service.from("payments").update(updates).eq("id", paymentId);
    if (upErr) {
      console.error("UPI update failed", upErr.code);
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Failed to update payment", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    await service.from("orders")
      .update({ payment_status: "pending", order_status: "processing" })
      .eq("id", orderId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("confirm-upi-payment error:", (err as Error).message);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
});
