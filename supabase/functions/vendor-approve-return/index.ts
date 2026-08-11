// vendor-approve-return: Thin orchestration wrapper around canonical Phase 4 RPCs.
// The Edge Function must become a thin orchestration layer. If implementation requires duplicating
// business rules already enforced by the RPCs, stop and remove the duplication instead of reimplementing it.
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { createClient } from "@supabase/supabase-js";
import { validateVendorApproveReturnRequest } from "../_shared/validation.ts";
import { normalizeRpcError } from "../../../src/shared/rpcErrorNormalizer.ts";

const ALLOWED_ORIGINS = [
  "https://koshurkart.com",
  "https://www.koshurkart.com",
  "http://localhost:5173",
  "http://localhost:3000",
];
const PRIMARY_ORIGIN = "https://koshurkart.com";
const CORS_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Vary": "Origin",
  };
}

const json = (body: unknown, status = 200, req: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Method not allowed", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.UNAUTHORIZED, "Unauthorized", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.UNAUTHORIZED, "Unauthorized", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });

    // ---- Input ----
    let payload: unknown;
    try { payload = await req.json(); } catch { return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.BAD_REQUEST, "Invalid JSON", false), { ...getCorsHeaders(req), "Content-Type": "application/json" }); }

    const valErr = validateVendorApproveReturnRequest(payload);
    if (valErr) {
      return json(valErr, 400, req);
    }

    const body = payload as Record<string, unknown>;
    const orderItemId = typeof body.order_item_id === "string" ? body.order_item_id : "";

    // ---- Razorpay creds ----
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Razorpay credentials not configured", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    const rzpAuth = "Basic " + btoa(`${keyId}:${keySecret}`);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ============================================================
    // STAGE 1 — Intent RPC
    // ============================================================
    console.log("[vendor-approve-return] STAGE 1: Invoking approve_return_intent", { orderItemId, vendorId: user.id });
    
    const { data: intentData, error: intentErr } = await service.rpc("approve_return_intent", {
      p_order_item_id: orderItemId,
      p_vendor_id: user.id
    });

    if (intentErr || !intentData?.success) {
      const errorCode = intentData?.errorCode || "INTERNAL_ERROR";
      const isIdempotentReplay = intentData?.isIdempotentReplay || false;
      console.error("[vendor-approve-return] STAGE 1 STOP: Intent rejected", { orderItemId, isIdempotentReplay, errorCode, error: intentErr || intentData });
      const mappedErr = normalizeRpcError(intentErr || intentData);
      return respondWithError(mappedErr, { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }

    const intentStatus = intentData.data.status;
    const amountPaise = intentData.data.amountPaise;
    const paymentId = intentData.data.paymentId;
    const operationKey = intentData.data.operationKey;
    const isIdempotentReplay = intentData.isIdempotentReplay;

    if (intentStatus === "escalated") {
      console.log("[vendor-approve-return] STAGE 1 STOP: Return escalated", { orderItemId, operationKey, isIdempotentReplay, escalationId: intentData.data.escalationId });
      return json(intentData, 200, req); // Return canonical RPC response
    }
    
    if (intentStatus !== "reversing") {
      console.error("[vendor-approve-return] STAGE 1 FATAL: Unknown intent status", { orderItemId, intentStatus, operationKey, isIdempotentReplay });
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Invalid intent status", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }

    console.log("[vendor-approve-return] STAGE 1 CONTINUE: Return reversing", { orderItemId, operationKey, isIdempotentReplay });

    // Read-only lookup required solely to invoke Razorpay APIs.
    const { data: item, error: itemErr } = await service.from("order_items").select("razorpay_transfer_id, price, quantity, order_id").eq("id", orderItemId).single();
    if (itemErr) {
      console.error("[vendor-approve-return] STAGE 1 FATAL: DB error looking up order item", { orderItemId, operationKey, error: itemErr });
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Database error retrieving order item", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }
    if (!item) {
      console.error("[vendor-approve-return] STAGE 1 FATAL: Order item not found", { orderItemId, operationKey });
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.NOT_FOUND, "Order item not found", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }
    const transferId = item.razorpay_transfer_id;
    // Gateway payload only.
    // Canonical validation occurs inside create_return_refund_confirm RPC.
    const linePaise = Math.round(Number(item.price) * Number(item.quantity) * 100);

    const { data: payment, error: paymentErr } = await service.from("payments").select("razorpay_payment_id").eq("id", paymentId).single();
    if (paymentErr) {
      console.error("[vendor-approve-return] STAGE 1 FATAL: DB error looking up payment", { orderItemId, paymentId, operationKey, error: paymentErr });
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Database error retrieving payment", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }
    if (!payment) {
      console.error("[vendor-approve-return] STAGE 1 FATAL: Payment missing", { orderItemId, paymentId, operationKey });
      return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.NOT_FOUND, "Payment missing", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }
    const rzpPaymentId = payment.razorpay_payment_id;

    // ============================================================
    // STAGE 2 — Razorpay Reversal & Reversal Confirm
    // ============================================================
    let confirmReversalData: { data?: { operationKey?: string }, isIdempotentReplay?: boolean } | null = null;
    let revIsIdempotentReplay = false;

    if (transferId) {
      console.log("[vendor-approve-return] STAGE 2A: Calling Razorpay Reversal", { orderItemId, operationKey, isIdempotentReplay, transferId, amountPaise });
      
      const revRes = await fetch(
        `https://api.razorpay.com/v1/transfers/${transferId}/reversals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: rzpAuth,
            // Gateway retry MUST reuse the exact same idempotency key
            "X-Razorpay-Idempotency-Key": `return-reversal-${orderItemId}-${transferId}`,
          },
          body: JSON.stringify({ amount: amountPaise }),
        },
      );
      
      if (!revRes.ok) {
        const errText = await revRes.text();
        const errMessage = errText.toLowerCase();
        console.error("[vendor-approve-return] STAGE 2A STOP: Gateway reversal failed", { orderItemId, operationKey, isIdempotentReplay, transferId, status: revRes.status, response: errText });
        const code = errMessage.includes("rate") || errMessage.includes("throttle") ? ERROR_CODES.RATE_LIMIT : ERROR_CODES.INTERNAL_ERROR;
        const category = errMessage.includes("rate") || errMessage.includes("throttle") ? ErrorCategory.RATE_LIMIT : ErrorCategory.GATEWAY_ERROR;
        return respondWithError(new PaymentError(category, code, "Gateway reversal failed. Please try again.", code === ERROR_CODES.RATE_LIMIT), { ...getCorsHeaders(req), "Content-Type": "application/json" });
      }

      const reversalId = (await revRes.json())?.id ?? null;
      if (!reversalId) {
        console.error("[vendor-approve-return] STAGE 2A STOP: Gateway returned no reversal ID", { orderItemId, operationKey, isIdempotentReplay });
        return respondWithError(new PaymentError(ErrorCategory.GATEWAY_ERROR, ERROR_CODES.INTERNAL_ERROR, "Invalid gateway response.", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
      }

      console.log("[vendor-approve-return] STAGE 2B: Invoking create_return_reversal_confirm", { orderItemId, operationKey, isIdempotentReplay, reversalId });
      
      const { data: revData, error: revErr } = await service.rpc("create_return_reversal_confirm", {
        p_order_item_id: orderItemId,
        p_razorpay_reversal_id: reversalId
      });

      if (revErr || !revData?.success) {
        const errorCode = revData?.errorCode || "INTERNAL_ERROR";
        // CRITICAL ORCHESTRATION OBSERVABILITY: Gateway succeeded, but local DB confirmation failed.
        console.error("[vendor-approve-return] STAGE 2B STOP: Gateway reversal Succeeded but local DB confirm rejected", { orderItemId, operationKey, reversalId, errorCode, error: revErr || revData });
        const mappedErr = normalizeRpcError(revErr || revData);
        return respondWithError(mappedErr, { ...getCorsHeaders(req), "Content-Type": "application/json" });
      }
      
      confirmReversalData = revData;
      revIsIdempotentReplay = revData.isIdempotentReplay;
      console.log("[vendor-approve-return] STAGE 2 CONTINUE: Reversal confirmed", { orderItemId, operationKey: revData.data.operationKey, isIdempotentReplay: revIsIdempotentReplay, reversalId });
    } else {
      console.log("[vendor-approve-return] STAGE 2 SKIPPED: No transfer ID present", { orderItemId, operationKey, isIdempotentReplay });
    }

    // ============================================================
    // STAGE 3 — Razorpay Refund & Refund Confirm
    // ============================================================
    if (!rzpPaymentId) {
      console.log("[vendor-approve-return] STAGE 3 STOP: No razorpay_payment_id available. Refunding logic skipped.", { orderItemId, operationKey });
      return json(confirmReversalData || intentData, 200, req);
    }

    const currentOperationKey = confirmReversalData?.data?.operationKey || operationKey;
    const operationKeySource = confirmReversalData?.data?.operationKey ? "reversal_confirm" : "intent";
    const currentIsIdempotentReplay = confirmReversalData ? revIsIdempotentReplay : isIdempotentReplay;

    console.log("[vendor-approve-return] STAGE 3A: Calling Razorpay Refund", { orderItemId, operationKey: currentOperationKey, operationKeySource, isIdempotentReplay: currentIsIdempotentReplay, rzpPaymentId, linePaise });
    
    const refRes = await fetch(
      `https://api.razorpay.com/v1/payments/${rzpPaymentId}/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: rzpAuth,
          // Gateway retry MUST reuse the exact same idempotency key
          "X-Razorpay-Idempotency-Key": `return-refund-${orderItemId}-${rzpPaymentId}`,
        },
        body: JSON.stringify({ amount: linePaise, notes: { order_item_id: orderItemId, order_id: item.order_id } }),
      },
    );

    if (!refRes.ok) {
      const errText = await refRes.text();
      const errMessage = errText.toLowerCase();
      console.error("[vendor-approve-return] STAGE 3A STOP: Gateway refund failed", { orderItemId, operationKey: currentOperationKey, isIdempotentReplay: currentIsIdempotentReplay, rzpPaymentId, status: refRes.status, response: errText });
      const code = errMessage.includes("rate") || errMessage.includes("throttle") ? ERROR_CODES.RATE_LIMIT : ERROR_CODES.INTERNAL_ERROR;
      const category = errMessage.includes("rate") || errMessage.includes("throttle") ? ErrorCategory.RATE_LIMIT : ErrorCategory.GATEWAY_ERROR;
      return respondWithError(new PaymentError(category, code, "Gateway refund failed. Please try again.", code === ERROR_CODES.RATE_LIMIT), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }

    const refundId = (await refRes.json())?.id ?? null;
    if (!refundId) {
      console.error("[vendor-approve-return] STAGE 3A STOP: Gateway returned no refund ID", { orderItemId, operationKey: currentOperationKey, isIdempotentReplay: currentIsIdempotentReplay });
      return respondWithError(new PaymentError(ErrorCategory.GATEWAY_ERROR, ERROR_CODES.INTERNAL_ERROR, "Invalid gateway response.", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }

    console.log("[vendor-approve-return] STAGE 3B: Invoking create_return_refund_confirm", { orderItemId, operationKey: currentOperationKey, isIdempotentReplay: currentIsIdempotentReplay, refundId });
    
    const { data: refData, error: refErr } = await service.rpc("create_return_refund_confirm", {
      p_order_item_id: orderItemId,
      p_razorpay_refund_id: refundId
    });

    if (refErr || !refData?.success) {
      const errorCode = refData?.errorCode || "INTERNAL_ERROR";
      // CRITICAL ORCHESTRATION OBSERVABILITY: Gateway succeeded, but local DB confirmation failed.
      console.error("[vendor-approve-return] STAGE 3B STOP: Gateway refund Succeeded but local DB confirm rejected", { orderItemId, operationKey: currentOperationKey, refundId, errorCode, error: refErr || refData });
      const mappedErr = normalizeRpcError(refErr || refData);
      return respondWithError(mappedErr, { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }

    console.log("[vendor-approve-return] STAGE 3 COMPLETE: Returning canonical RPC response", { orderItemId, operationKey: refData.data.operationKey, isIdempotentReplay: refData.isIdempotentReplay, refundId });
    return json(refData, 200, req);

  } catch (err) {
    console.error("[vendor-approve-return] STAGE UNEXPECTED ERROR:", (err as Error).message);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
  }
});
