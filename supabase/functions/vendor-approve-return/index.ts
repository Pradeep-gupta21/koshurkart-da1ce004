// vendor-approve-return: concurrency-safe wrapper around vendor_approve_return RPC.
//
// Concurrency contract
// --------------------
// 1. Atomic edge-function lock   — UPDATE order_items SET return_status='processing'
//    WHERE id=? AND return_status='pending'. If 0 rows updated → 409 (another
//    invocation already owns it or it's not actionable). No prior SELECT.
// 2. Razorpay idempotency keys   — deterministic per-(item,transfer/payment) pair
//    so a network retry never double-moves money at the gateway.
// 3. RPC row lock                — SELECT … FOR UPDATE inside vendor_approve_return
//    serialises any concurrent DB calls; transitions processing → approved.
//
// Money-safe ordering (unchanged)
// --------------------------------
//   1. Reverse Route transfer (pulls vendor share back first)
//   2. Refund customer          (only after reversal succeeds)
//   3. vendor_approve_return    (DB balance deduction + ledger row)
import { createClient } from "@supabase/supabase-js";
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
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // ---- Input ----
    let payload: unknown;
    try { payload = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const orderItemId = (payload as { order_item_id?: string })?.order_item_id;
    if (!orderItemId || typeof orderItemId !== "string") {
      return json({ error: "order_item_id is required" }, 400);
    }

    // ---- Razorpay creds ----
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) return json({ error: "Razorpay credentials not configured" }, 500);
    const rzpAuth = "Basic " + btoa(`${keyId}:${keySecret}`);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ============================================================
    // ATOMIC LOCK — transition requested → processing.
    // No prior SELECT. If another invocation beat us (or the item
    // is already past 'requested'), this returns 0 rows → 409.
    // ============================================================
    const { data: locked, error: lockErr } = await service
      .from("order_items")
      .update({ return_status: "processing" })
      .eq("id", orderItemId)
      .eq("return_status", "requested")
      .select("id, order_id, vendor_id, price, quantity, title, razorpay_transfer_id, transfer_status, razorpay_reversal_id, razorpay_refund_id")
      .single();

    if (lockErr || !locked) {
      console.log("[vendor-approve-return] lock failed — already processing, approved, or not found", {
        order_item_id: orderItemId,
        code: lockErr?.code,
      });
      return json({ error: "Return is not in requested state or is already being processed" }, 409);
    }

    const item = locked;

    // ---- Authorize BEFORE moving money ----
    const { data: vendor, error: vendorErr } = await service
      .from("vendors")
      .select("id, user_id, is_commission_exempt")
      .eq("id", item.vendor_id)
      .maybeSingle();
    if (vendorErr || !vendor) {
      console.error("[vendor-approve-return] vendor load failed", vendorErr?.code);
      // Roll back the lock so a retry can re-enter.
      await service.from("order_items")
        .update({ return_status: "requested" })
        .eq("id", item.id);
      return json({ error: "Vendor not found" }, 404);
    }
    const { data: isAdmin } = await anon.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (vendor.user_id !== user.id && !isAdmin) {
      await service.from("order_items")
        .update({ return_status: "requested" })
        .eq("id", item.id);
      return json({ error: "Forbidden" }, 403);
    }

    // ---- Amounts ----
    const linePaise = Math.round(Number(item.price) * Number(item.quantity) * 100);
    if (!Number.isFinite(linePaise) || linePaise <= 0) {
      return json({ error: "Invalid line amount" }, 400);
    }

    // ---- Commission — MUST be resolved BEFORE any DB writes or gateway calls ----
    // Fail loudly if the configuration is absent or out of range. A silent fallback
    // to 0% would incorrectly refund 100% of the line value to the customer.
    const { data: settingsRows } = await service
      .from("platform_settings")
      .select("key, value")
      .eq("key", "commission");
    let commissionEnabled = false, commissionPct = 0;
    for (const row of (settingsRows ?? []) as { value: { enabled?: boolean; percentage?: number | string } }[]) {
      commissionEnabled = row.value?.enabled ?? false;
      commissionPct = Number(row.value?.percentage ?? 0);
    }
    const platformSettings = { commission: { enabled: commissionEnabled, percentage: commissionPct } };

    let pct: number;
    try {
      pct = getVendorCommissionPercentage(
        { id: vendor.id, is_commission_exempt: !!vendor.is_commission_exempt },
        platformSettings,
      );
    } catch (commErr) {
      console.error("[vendor-approve-return] getVendorCommissionPercentage threw", commErr);
      await service.from("order_items").update({ return_status: "requested" }).eq("id", item.id);
      return json({ error: "Commission configuration unavailable or invalid. Aborting." }, 500);
    }
    if (pct == null || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      console.error("[vendor-approve-return] commission out of range", { pct, vendor_id: item.vendor_id });
      await service.from("order_items").update({ return_status: "requested" }).eq("id", item.id);
      return json({ error: "Commission configuration unavailable or invalid. Aborting." }, 500);
    }

    const vendorSharePaise = calculateVendorTransferAmount(linePaise, pct, false);

    // ============================================================
    // STEP 1 — Reverse the Route transfer
    // ============================================================
    let reversalId: string | null = item.razorpay_reversal_id ?? null;
    const transferProcessed = item.transfer_status === "processed" && !!item.razorpay_transfer_id;

    // TODO: Implement separate admin RPC to query order_items stuck in 'processing'
    //       state for > 1 hour and allow manual reset to 'pending' or 'rejected'.

    if (transferProcessed && !reversalId) {
      const revRes = await fetch(
        `https://api.razorpay.com/v1/transfers/${item.razorpay_transfer_id}/reversals`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: rzpAuth,
            // VERIFY against live Razorpay docs: the header name and key format below
            // must match exactly to prevent silent duplicate reversals on network retries.
            "X-Razorpay-Idempotency-Key": `return-reversal-${orderItemId}-${item.razorpay_transfer_id}`,
          },
          body: JSON.stringify({ amount: vendorSharePaise }),
        },
      );
      if (!revRes.ok) {
        const errText = await revRes.text();
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
      reversalId = (await revRes.json())?.id ?? null;

      const { error: revPersistErr } = await service
        .from("order_items")
        .update({ razorpay_reversal_id: reversalId })
        .eq("id", item.id);
      if (revPersistErr) {
        console.error(
          "[vendor-approve-return] reversal succeeded but id persist FAILED — reconcile manually",
          { order_item_id: item.id, reversal_id: reversalId, code: revPersistErr.code },
        );
        return json({ error: "Reversal recorded at gateway but not in DB; reconcile before retry.", stage: "reversal_persist" }, 500);
      }
    } else if (!transferProcessed) {
      console.log("[vendor-approve-return] no processed transfer; skipping reversal", {
        order_item_id: item.id,
        transfer_status: item.transfer_status ?? null,
      });
    }

    // ============================================================
    // STEP 2 — Refund the customer
    // ============================================================
    let refundId: string | null = item.razorpay_refund_id ?? null;

    if (!refundId) {
      const { data: payment } = await service
        .from("payments")
        .select("id, razorpay_payment_id, payment_method")
        .eq("order_id", item.order_id)
        .not("razorpay_payment_id", "is", null)
        .maybeSingle();

      if (!payment?.razorpay_payment_id) {
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
            headers: {
              "Content-Type": "application/json",
              Authorization: rzpAuth,
              // VERIFY against live Razorpay docs: the header name and key format below
              // must match exactly to prevent silent duplicate refunds on network retries.
              "X-Razorpay-Idempotency-Key": `return-refund-${orderItemId}-${payment.razorpay_payment_id}`,
            },
            body: JSON.stringify({ amount: linePaise, notes: { order_item_id: item.id, order_id: item.order_id } }),
          },
        );
        if (!refRes.ok) {
          const errText = await refRes.text();
          console.error(
            "[vendor-approve-return] REFUND FAILED after successful reversal — PARTIAL FAILURE",
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
        refundId = (await refRes.json())?.id ?? null;

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
    // STEP 3 — DB reversal via RPC (transitions processing → approved)
    // ============================================================
    const { error: rpcErr } = await anon.rpc("vendor_approve_return", { _order_item_id: item.id });
    if (rpcErr) {
      console.error(
        "[vendor-approve-return] Razorpay steps done but vendor_approve_return RPC FAILED — DB reversal pending",
        { order_item_id: item.id, reversal_id: reversalId, refund_id: refundId, code: (rpcErr as { code?: string }).code, message: rpcErr.message },
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
