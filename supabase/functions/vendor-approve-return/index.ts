// vendor-approve-return: money-correct wrapper around the vendor_approve_return RPC.
//
// The vendor_approve_return Postgres RPC does DB-side reversal ONLY (decrements
// vendor balances + writes a return_deduction ledger row). Postgres cannot make
// outbound HTTP calls, so it never moves real money at Razorpay. This edge
// function performs the two real-money steps in the ONLY order that is
// financially safe, THEN calls the RPC:
//
//   1. Reverse the Route transfer  — POST /v1/transfers/{id}/reversals
//        pulls the vendor's share back into KoshurKart's account.
//   2. Refund the customer         — POST /v1/payments/{id}/refund
//        returns the customer's money.
//   3. vendor_approve_return RPC   — DB balance reversal + ledger row.
//
// Ordering is load-bearing: if we refunded BEFORE reversing, KoshurKart would
// pay the customer from its own pocket while the vendor still holds the
// Route-transferred money — a real, unrecoverable loss. So the refund is
// STRUCTURALLY gated on a successful reversal: reversal failure returns an error
// and never reaches the refund call.
//
// Idempotency / retry-safety: reversal id and refund id are persisted on the
// order_items row the instant each Razorpay call succeeds, and re-read at the
// top of every invocation. A retry after a mid-flow crash skips whatever already
// completed (reversal done -> skip reversal; refund done -> skip refund) instead
// of double-moving money. The RPC's own `return_status = 'requested'` guard is
// the final backstop against a fully-completed return being re-run.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  calculateVendorTransferAmount,
  getVendorCommissionPercentage,
} from "../_shared/pricing.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ---- Auth (caller's JWT) ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Caller-scoped client: used for auth.getUser(), the has_role check, AND the
    // final RPC call — vendor_approve_return authorizes via auth.uid(), so it
    // MUST run under the caller's JWT, never the service-role key.
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // ---- Input ----
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const orderItemId = (payload as { order_item_id?: string })?.order_item_id;
    if (!orderItemId || typeof orderItemId !== "string") {
      return json({ error: "order_item_id is required" }, 400);
    }

    // ---- Razorpay creds (identical pattern to create-checkout) ----
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      return json({ error: "Razorpay credentials not configured" }, 500);
    }
    const rzpAuth = "Basic " + btoa(`${keyId}:${keySecret}`);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Load the line item ----
    const { data: item, error: itemErr } = await service
      .from("order_items")
      .select(
        "id, order_id, vendor_id, price, quantity, title, return_status, " +
          "razorpay_transfer_id, transfer_status, razorpay_reversal_id, razorpay_refund_id",
      )
      .eq("id", orderItemId)
      .maybeSingle();

    if (itemErr) {
      console.error("[vendor-approve-return] order_items load failed", itemErr.code);
      return json({ error: "Failed to load order item" }, 500);
    }
    if (!item) return json({ error: "Order item not found" }, 404);

    // ---- Authorize BEFORE moving any money ----
    // The RPC enforces this too, but the RPC runs LAST — an unauthorized caller
    // must never be able to trigger a reversal/refund and only fail afterward.
    // Mirror the RPC's rule: the item's vendor owner, or an admin.
    const { data: vendor, error: vendorErr } = await service
      .from("vendors")
      .select("id, user_id, is_commission_exempt")
      .eq("id", item.vendor_id)
      .maybeSingle();
    if (vendorErr || !vendor) {
      console.error("[vendor-approve-return] vendor load failed", vendorErr?.code);
      return json({ error: "Vendor not found" }, 404);
    }
    const { data: isAdmin } = await anon.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (vendor.user_id !== user.id && !isAdmin) {
      return json({ error: "Forbidden" }, 403);
    }

    // ---- Guard: only a 'requested' return is actionable ----
    // Re-checked here so we don't move money for an already-approved/rejected
    // return; the RPC re-checks it under a row lock as the authoritative guard.
    if (item.return_status !== "requested") {
      return json({ error: `Return is not in requested state (current: ${item.return_status})` }, 409);
    }

    // ---- Amounts (integer paise, same helpers as checkout) ----
    // Refund = the full price the customer paid for this line.
    // Reversal = the vendor's share of that line (what Route actually transferred),
    // computed via the SAME pricing helpers create-checkout used, so the reversal
    // amount can never drift from the original transfer amount.
    const linePaise = Math.round(Number(item.price) * Number(item.quantity) * 100);
    if (!Number.isFinite(linePaise) || linePaise <= 0) {
      return json({ error: "Invalid line amount" }, 400);
    }

    // Platform commission setting, in the shape getVendorCommissionPercentage wants.
    let commissionEnabled = false;
    let commissionPct = 0;
    const { data: settingsRows } = await service
      .from("platform_settings")
      .select("key, value")
      .eq("key", "commission");
    for (const row of (settingsRows ?? []) as any[]) {
      commissionEnabled = (row.value as any)?.enabled ?? false;
      commissionPct = Number((row.value as any)?.percentage ?? 0);
    }
    const platformSettings = { commission: { enabled: commissionEnabled, percentage: commissionPct } };
    const pct = getVendorCommissionPercentage(
      { id: vendor.id, is_commission_exempt: !!vendor.is_commission_exempt },
      platformSettings,
    );
    const vendorSharePaise = calculateVendorTransferAmount(linePaise, pct, false);

    // ============================================================
    // STEP 1 — Reverse the Route transfer (only if one processed)
    // ============================================================
    let reversalId: string | null = item.razorpay_reversal_id ?? null;
    const transferProcessed = item.transfer_status === "processed" && !!item.razorpay_transfer_id;

    if (transferProcessed && !reversalId) {
      const revRes = await fetch(
        `https://api.razorpay.com/v1/transfers/${item.razorpay_transfer_id}/reversals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: rzpAuth },
          body: JSON.stringify({ amount: vendorSharePaise }),
        },
      );
      if (!revRes.ok) {
        const errText = await revRes.text();
        // HARD STOP. Do NOT refund, do NOT call the RPC. Reversal failing means
        // the vendor still holds the money; refunding now = guaranteed loss.
        // Return an error so an admin can retry (this call is idempotent).
        console.error(
          "[vendor-approve-return] TRANSFER REVERSAL FAILED — aborting before refund",
          { order_item_id: item.id, transfer_id: item.razorpay_transfer_id, status: revRes.status, body: errText.slice(0, 500) },
        );
        return json({
          error: "Transfer reversal failed; refund not attempted. Safe to retry.",
          stage: "reversal",
          razorpay_status: revRes.status,
        }, 502);
      }
      const revBody = await revRes.json();
      reversalId = revBody?.id ?? null;

      // Persist the reversal id IMMEDIATELY so a crash before/at the refund step
      // is recoverable and a retry won't reverse twice.
      const { error: revPersistErr } = await service
        .from("order_items")
        .update({ razorpay_reversal_id: reversalId })
        .eq("id", item.id);
      if (revPersistErr) {
        // The reversal DID happen at Razorpay; failing to record it is a
        // bookkeeping problem, not a money problem. Log loudly and stop so an
        // admin reconciles rather than us charging ahead with an unrecorded id.
        console.error(
          "[vendor-approve-return] reversal succeeded but id persist FAILED — reconcile manually",
          { order_item_id: item.id, reversal_id: reversalId, code: revPersistErr.code },
        );
        return json({ error: "Reversal recorded at gateway but not in DB; reconcile before retry.", stage: "reversal_persist" }, 500);
      }
    } else if (!transferProcessed) {
      // No processed transfer for this line -> nothing was ever paid to the
      // vendor at Razorpay -> nothing to reverse. Proceed straight to refund.
      console.log("[vendor-approve-return] no processed transfer; skipping reversal", {
        order_item_id: item.id,
        transfer_status: item.transfer_status ?? null,
      });
    }

    // ============================================================
    // STEP 2 — Refund the customer (only AFTER any needed reversal)
    // ============================================================
    let refundId: string | null = item.razorpay_refund_id ?? null;

    if (!refundId) {
      // Find the gateway payment for this order.
      const { data: payment } = await service
        .from("payments")
        .select("id, razorpay_payment_id, payment_method")
        .eq("order_id", item.order_id)
        .not("razorpay_payment_id", "is", null)
        .maybeSingle();

      if (!payment?.razorpay_payment_id) {
        // No online payment to refund at Razorpay (e.g. COD / cash). There is no
        // gateway refund to issue; the DB reversal below still records the
        // deduction. Log clearly and continue.
        console.log("[vendor-approve-return] no razorpay_payment_id; skipping gateway refund", {
          order_item_id: item.id,
          order_id: item.order_id,
          payment_method: payment?.payment_method ?? null,
        });
      } else {
        const refRes = await fetch(
          `https://api.razorpay.com/v1/payments/${payment.razorpay_payment_id}/refund`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: rzpAuth },
            body: JSON.stringify({ amount: linePaise, notes: { order_item_id: item.id, order_id: item.order_id } }),
          },
        );
        if (!refRes.ok) {
          const errText = await refRes.text();
          // PARTIAL-FAILURE STATE: the reversal (if any) already pulled money back
          // from the vendor, but the customer refund did not go through. This is
          // recoverable by an admin re-invoking this endpoint (idempotent: the
          // reversal is skipped, the refund retried). Log LOUDLY — never swallow.
          console.error(
            "[vendor-approve-return] REFUND FAILED after successful reversal — PARTIAL FAILURE, money pulled from vendor but customer NOT refunded",
            {
              order_item_id: item.id,
              order_id: item.order_id,
              payment_id: payment.razorpay_payment_id,
              reversal_id: reversalId,
              status: refRes.status,
              body: errText.slice(0, 500),
            },
          );
          return json({
            error: "Refund failed after reversal. Vendor debited, customer NOT yet refunded — retry to complete.",
            stage: "refund",
            partial_failure: true,
            reversal_id: reversalId,
            razorpay_status: refRes.status,
          }, 502);
        }
        const refBody = await refRes.json();
        refundId = refBody?.id ?? null;

        // Persist refund id immediately (same reasoning as the reversal id).
        const { error: refPersistErr } = await service
          .from("order_items")
          .update({ razorpay_refund_id: refundId, return_refunded_at: new Date().toISOString() })
          .eq("id", item.id);
        if (refPersistErr) {
          console.error(
            "[vendor-approve-return] refund succeeded but id persist FAILED — reconcile manually",
            { order_item_id: item.id, refund_id: refundId, code: refPersistErr.code },
          );
          return json({ error: "Refund issued at gateway but not recorded in DB; reconcile before retry.", stage: "refund_persist" }, 500);
        }
      }
    }

    // ============================================================
    // STEP 3 — DB-side reversal via the existing RPC (unchanged)
    // ============================================================
    // Runs under the caller's JWT so the RPC's auth.uid() check passes. The RPC
    // flips return_status 'requested' -> 'approved', so this whole endpoint is
    // naturally single-shot: a repeat call is blocked by the guard above.
    const { error: rpcErr } = await anon.rpc("vendor_approve_return", { _order_item_id: item.id });
    if (rpcErr) {
      // Money has already moved correctly at Razorpay (reversal + refund both
      // succeeded/were unnecessary). Only the DB balance/ledger write failed.
      // Loud log; admin can re-run (Razorpay steps skip via persisted ids, RPC
      // retried) since return_status is still 'requested'.
      console.error(
        "[vendor-approve-return] Razorpay steps done but vendor_approve_return RPC FAILED — DB reversal pending",
        { order_item_id: item.id, reversal_id: reversalId, refund_id: refundId, code: (rpcErr as any).code, message: rpcErr.message },
      );
      return json({
        error: "Razorpay reversal/refund done but DB reversal failed — retry to finish.",
        stage: "db_rpc",
        reversal_id: reversalId,
        refund_id: refundId,
        message: rpcErr.message,
      }, 500);
    }

    return json({
      ok: true,
      order_item_id: item.id,
      reversal_id: reversalId,
      refund_id: refundId,
      reversed_amount_paise: transferProcessed ? vendorSharePaise : 0,
      refunded_amount_paise: refundId ? linePaise : 0,
    });
  } catch (err) {
    console.error("[vendor-approve-return] unexpected error", (err as Error).message);
    return json({ error: "Internal server error" }, 500);
  }
});
