import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, "Unauthorized", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "orderId is required", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    // SERVER-SIDE source of truth: re-fetch the order total. Never trust client `amount`.
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error: orderErr } = await service
      .from("orders")
      .select("id, user_id, total_amount")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      console.error("[create-razorpay-order] order DB lookup error", orderErr.code, orderErr.message);
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    if (!order) {
      return respondWithError(new PaymentError(ErrorCategory.NOT_FOUND, ERROR_CODES.INTERNAL_ERROR, "Order not found", false), { ...corsHeaders, "Content-Type": "application/json" });
    }
    if (order.user_id !== user.id) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHORIZATION, ERROR_CODES.INTERNAL_ERROR, "Forbidden", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const amount = Number(order.total_amount);
    if (!amount || amount <= 0) {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Invalid order amount", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Razorpay credentials not configured", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const amountPaise = Math.round(amount * 100);
    if (amountPaise < 100) {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, "Amount must be at least ₹1", false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    // Razorpay receipt: max 40 chars. UUID is 36 — safe, but truncate defensively.
    const receipt = `ord_${orderId.replace(/-/g, "").slice(0, 32)}`;

    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
      }),
    });

    if (!razorpayRes.ok) {
      const errorBody = await razorpayRes.text();
      let parsedError = "Failed to create Razorpay order";
      let errorCode = "UNKNOWN";
      try {
        const parsed = JSON.parse(errorBody);
        parsedError = parsed?.error?.description || parsedError;
        errorCode = parsed?.error?.code || errorCode;
      } catch { /* keep default */ }
      console.error("Razorpay API error:", razorpayRes.status, errorCode);
      return respondWithError(new PaymentError(ErrorCategory.GATEWAY_ERROR, ERROR_CODES.INTERNAL_ERROR, parsedError, false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const razorpayOrder = await razorpayRes.json();

    return new Response(
      JSON.stringify({
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-razorpay-order error:", (err as Error).message);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
});
