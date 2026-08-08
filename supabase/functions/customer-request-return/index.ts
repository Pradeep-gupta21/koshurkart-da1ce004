import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { createClient } from "@supabase/supabase-js";
import { validateCustomerRequestReturnRequest } from "../_shared/validation.ts";
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

const ALLOWED_METHODS = "POST, OPTIONS";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Vary": "Origin",
  };
}

const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return respondWithError(new PaymentError(ErrorCategory.METHOD_NOT_ALLOWED, ERROR_CODES.METHOD_NOT_ALLOWED, "Method not allowed", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });

  try {
    const requestCorrelationId = req.headers.get("x-request-id");
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

    const valErr = validateCustomerRequestReturnRequest(payload);
    if (valErr) {
      return json(valErr, req, 400);
    }

    const body = payload as Record<string, unknown>;
    const orderItemId = typeof body.order_item_id === "string" ? body.order_item_id : "";
    const returnReason = typeof body.return_reason === "string" ? body.return_reason : "";
    const returnDescription = typeof body.return_description === "string" ? body.return_description : "";
    const returnPhotos = body.return_photos as string[];

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ============================================================
    // STAGE 1 — Invoke create_return_request RPC
    // ============================================================
    console.log("[customer-request-return] STAGE 1: Invoking create_return_request", { requestCorrelationId, stage: 1 });
    
    const { data: rpcData, error: rpcErr } = await service.rpc("create_return_request", {
      p_order_item_id: orderItemId,
      p_customer_id: user.id,
      p_return_reason: returnReason,
      p_return_description: returnDescription,
      p_return_photos: returnPhotos
    });

    if (rpcErr || !rpcData?.success) {
      const errorCode = rpcData?.errorCode || "INTERNAL_ERROR";
      const isIdempotentReplay = rpcData?.isIdempotentReplay || false;
      console.error("[customer-request-return] STAGE 1 STOP: Return request failed", { requestCorrelationId, stage: 1, isIdempotentReplay, errorCode });
      const mappedErr = normalizeRpcError(rpcErr || rpcData);
      return respondWithError(mappedErr, { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }

    const isIdempotentReplay = rpcData.isIdempotentReplay === true;
    console.log("[customer-request-return] STAGE 1 COMPLETE: Request persisted successfully", { requestCorrelationId, stage: 1, isIdempotentReplay });

    // Enforce Deterministic Warning Contract
    const finalResponse = {
      ...rpcData,
      warnings: [] as string[]
    };

    // ============================================================
    // STAGE 2 — Email Dispatch
    // ============================================================
    if (isIdempotentReplay) {
      console.log("[customer-request-return] STAGE 2 SKIPPED: Idempotent replay detected, suppressing duplicate email dispatch", { requestCorrelationId, stage: 2 });
      return json(finalResponse, req, 200);
    }

    try {
      console.log("[customer-request-return] STAGE 2: Invoking send-transactional-email", { requestCorrelationId, stage: 2 });
      
      const invokePromise = anon.functions.invoke("send-transactional-email", {
        body: { type: "return_requested", orderItemId }
      });

      let timerId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => 
        timerId = setTimeout(() => reject(new Error("INVOCATION_TIMEOUT")), 5000)
      );

      const { data: emailData, error: emailErr } = await Promise.race([
        invokePromise,
        timeoutPromise
      ]).finally(() => clearTimeout(timerId));

      if (emailErr || !emailData?.ok) {
        throw new Error("EMAIL_DISPATCH_FAILED");
      }
      
      console.log("[customer-request-return] STAGE 2 COMPLETE: Email dispatched successfully", { 
        requestCorrelationId, 
        stage: 2, 
        emailStatus: "success" 
      });
      return json(finalResponse, req, 200);
    } catch (emailErr) {
      console.error("[customer-request-return] STAGE 2 FAILED: Email dispatch failed, but database transaction remains committed.", {
        requestCorrelationId,
        stage: 2,
        isIdempotentReplay: false
      });
      
      // Do not rollback. Append warning to canonical RPC response.
      finalResponse.warnings.push("EMAIL_DISPATCH_FAILED");
      return json(finalResponse, req, 200);
    }

  } catch (err) {
    console.error("[customer-request-return] STAGE UNEXPECTED ERROR: Execution failed", { stage: "unexpected_error" });
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
  }
});
