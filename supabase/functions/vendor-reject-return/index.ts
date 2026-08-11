import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { createClient } from "@supabase/supabase-js";
import { validateVendorRejectReturnRequest } from "../_shared/validation.ts";
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
  if (req.method !== "POST") return respondWithError(new PaymentError(ErrorCategory.METHOD_NOT_ALLOWED, ERROR_CODES.METHOD_NOT_ALLOWED, "Method not allowed", false), { ...getCorsHeaders(req), "Content-Type": "application/json", "Allow": "POST" });

  const reqId = crypto.randomUUID();

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

    const valErr = validateVendorRejectReturnRequest(payload);
    if (valErr) {
      return json(valErr, 400, req);
    }

    const body = payload as Record<string, unknown>;
    const orderItemId = typeof body.order_item_id === "string" ? body.order_item_id : "";

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ============================================================
    // STAGE 1 — Invoke vendor_reject_return RPC
    // ============================================================
    console.log({
      component: "vendor-reject-return",
      stage: "rpc_invocation",
      reqId,
      orderItemId
    });
    
    const { data: rpcData, error: rpcErr } = await service.rpc("vendor_reject_return", {
      p_order_item_id: orderItemId,
      p_auth_user_id: user.id
    });

    if (rpcErr || !rpcData?.success) {
      const errorCode = rpcData?.errorCode || "INTERNAL_ERROR";
      const isIdempotentReplay = rpcData?.isIdempotentReplay || false;
      console.error({
        component: "vendor-reject-return",
        stage: "error_handling",
        reqId,
        orderItemId,
        isIdempotentReplay,
        errorCode
      });
      const mappedErr = normalizeRpcError(rpcErr || rpcData);
      return respondWithError(mappedErr, { ...getCorsHeaders(req), "Content-Type": "application/json" });
    }

    console.log({
      component: "vendor-reject-return",
      stage: "response_normalization",
      reqId,
      orderItemId,
      isIdempotentReplay: rpcData.isIdempotentReplay
    });
    return json(rpcData, 200, req);

  } catch (err) {
    console.error({
      component: "vendor-reject-return",
      stage: "unexpected_exception",
      reqId,
      errorCode: ERROR_CODES.INTERNAL_ERROR
    });
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error", false), { ...getCorsHeaders(req), "Content-Type": "application/json" });
  }
});
