// request-payout: server-side payout request with balance validation.
//
// Security contract
// -----------------
// 1. JWT extracted from the Authorization header → user identity verified via anon client.
// 2. vendor_id resolved from the vendors table (user cannot supply their own vendor_id).
// 3. Balance check + INSERT executed atomically inside process_vendor_payout RPC:
//    - Locks the vendor row (FOR UPDATE) to eliminate TOCTOU race between concurrent requests.
//    - Verifies method_id belongs to the vendor (IDOR guard).
//    - Validates amount > 0 and ≤ withdrawable_balance; raises exception on failure.
//    - Reserves funds immediately (deducts balance + ledger entry) on pending.
//    - Inserts the payout record idempotently (unique idempotency_key).
// 4. Only service_role can invoke the RPC; client writes to payouts are blocked by RLS.
import { createClient } from "@supabase/supabase-js";
import { validatePayoutRequest } from "../_shared/validation.ts";
import { handleRpcError } from "../_shared/rpcErrorMapper.ts";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, req);

    // Verify the JWT using the anon client (passes the token through to Supabase Auth).
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401, req);

    // ---- Parse body ----
    let payload: unknown;
    try { payload = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400, req); }
    
    const valErr = validatePayoutRequest(payload);
    if (valErr) {
      return json(valErr, 400, req);
    }

    const body = payload as Record<string, any>;
    const amount = body.amount;
    const methodId = body.methodId;
    const idempotencyKeyValue = body.idempotencyKey ?? body.p_idempotency_key;

    // ---- Service-role client (bypasses RLS for authoritative reads + writes) ----
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Resolve vendor_id from the authenticated user ----
    // The client never supplies vendor_id; we derive it server-side so a user
    // cannot forge a payout on behalf of another vendor.
    const { data: vendor, error: vendorErr } = await service
      .from("vendors")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (vendorErr) {
      console.error("[request-payout] vendor lookup error", vendorErr.code);
      return json({ error: "Internal server error" }, 500, req);
    }
    if (!vendor) return json({ error: "Vendor profile not found" }, 404, req);

    const vendorId: string = vendor.id;

    // ---- Atomic balance check + insert via RPC ----
    // request_payout locks the vendor row (FOR UPDATE), validates the
    // amount against withdrawable_balance, and inserts the payout record —
    // all inside a single transaction. This eliminates the TOCTOU window
    // that existed when balance-read and insert were separate round-trips.
    const methodIdValue = (methodId && typeof methodId === "string") ? methodId : null;

    const { data: payoutRows, error: rpcErr } = await service
      .rpc("request_payout", {
        p_vendor_id: vendorId,
        p_amount: amount,
        p_method_id: methodIdValue,
        p_idempotency_key: idempotencyKeyValue,
      });

    if (rpcErr) {
      const mappedErr = handleRpcError(rpcErr);
      if (mappedErr.status === 500) {
        console.error("[request-payout] request_payout RPC error", rpcErr.code, rpcErr.message);
      }
      return json({ error: mappedErr.error }, mappedErr.status, req);
    }

    const payout = Array.isArray(payoutRows) ? payoutRows[0] : payoutRows;

    // ---- Post-reservation gateway / downstream logic ----
    // Funds are now reserved (balance debited, payout row is 'pending').
    // Any work that must happen AFTER the reservation goes here.
    // If it fails, rollback_vendor_payout credits the funds back and marks
    // the payout 'failed' so the vendor's balance is not orphaned.
    try {
      // TODO: insert real gateway / disbursement API call here.
      // Example:
      //   const gatewayResult = await callDisbursementGateway(payout);
      //   if (!gatewayResult.ok) throw new Error(gatewayResult.error);
      //
      // For now: no external call — the payout remains pending for admin
      // approval; nothing to roll back at this stage.
    } catch (gatewayErr) {
      const errMsg = (gatewayErr as Error).message ?? "Unknown gateway error";
      console.error("[request-payout] gateway error after reservation, rolling back payout", payout?.id, errMsg);

      // Release the reserved funds back to the vendor.
      const { error: rollbackError } = await service.rpc("rollback_vendor_payout", {
        p_payout_id: payout?.id,
      });
      if (rollbackError) {
        // Rollback itself failed — throw so the outer catch fires a true 500.
        // DO NOT return a clean response here: funds were NOT released and
        // the client must not be told otherwise. Let DevOps be alerted.
        console.error(
          "[request-payout] CRITICAL: rollback_vendor_payout failed for payout",
          payout?.id,
          rollbackError,
        );
        throw new Error(
          "CRITICAL: Gateway failed and database rollback failed. Manual reconciliation required.",
        );
      }

      return json({ error: "Payout gateway failure; funds have been released" }, 500, req);
    }

    return json({ ok: true, payout }, 200, req);
  } catch (err) {
    console.error("[request-payout] unexpected error", (err as Error).message);
    return json({ error: "Internal server error" }, 500, req);
  }
});
