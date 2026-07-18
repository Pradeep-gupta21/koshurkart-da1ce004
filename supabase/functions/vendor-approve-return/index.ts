// vendor-approve-return: concurrency-safe wrapper around vendor_approve_return RPC.
//
// Concurrency contract
// --------------------
// 1. Atomic edge-function lock   — UPDATE order_items SET return_status='processing',
//    return_lock_key=<idempotency key> WHERE id=? AND return_status='requested'.
//    No prior SELECT. If 0 rows updated, the stored return_lock_key decides:
//      * matches the incoming key → same operation retrying → RESUME (each money
//        step below is individually idempotent via persisted reversal/refund ids)
//      * differs (or item not 'processing') → 409, genuine conflict.
//    Same-key racers may both proceed; the gateway idempotency keys (2) and the
//    RPC row lock (3) keep double-execution money-safe.
// 2. Razorpay idempotency keys   — deterministic per-(item,transfer/payment) pair
//    so a network retry never double-moves money at the gateway.
// 3. RPC row lock                — SELECT … FOR UPDATE inside vendor_approve_return
//    serialises any concurrent DB calls; transitions processing → approved.
// 4. Lock release                — every pre-money failure path releases the lock
//    via releaseLock(), fenced by the owner's idempotency key so it can only
//    release its OWN lock. A key mismatch (another request took over) is a clean
//    no-op warning; a failed release is CRITICAL (the row would be stuck in
//    'processing') and logged with full context, never silently.
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

// Columns pulled when acquiring OR resuming the processing lock. Kept in one
// place so the acquisition UPDATE and the resume SELECT always agree.
const LOCK_COLUMNS =
  "id, order_id, vendor_id, price, quantity, title, razorpay_transfer_id, transfer_status, razorpay_reversal_id, razorpay_refund_id, return_status, return_lock_key";

// Release a processing lock back to 'requested' so a future request can re-enter.
//
// The release is FENCED by the caller's idempotency key: it only touches the row
// while that row is still in 'processing' AND still owned by this operation's
// key. This prevents a slow/duplicate invocation from releasing a lock that a
// newer request has since taken ownership of.
//
// Three outcomes:
//   * "released"          — the row was ours and is now back to 'requested'.
//   * "ownership_changed" — 0 rows matched: the row is no longer in 'processing'
//                           under our key (another request took over, or it
//                           already advanced). Not an error — we exit cleanly
//                           and leave the record untouched.
//   * "db_error"          — the update itself failed (infrastructure). CRITICAL:
//                           the row may be stuck in 'processing'; surfaced loudly.
// deno-lint-ignore no-explicit-any
async function releaseLock(
  service: any,
  itemId: string,
  ownerKey: string,
  context: string,
): Promise<"released" | "ownership_changed" | "db_error"> {
  const { data, error } = await service
    .from("order_items")
    .update({ return_status: "requested", return_lock_key: null })
    .eq("id", itemId)
    .eq("return_status", "processing")
    .eq("return_lock_key", ownerKey)
    .select("id");
  if (error) {
    console.error(
      "[vendor-approve-return] CRITICAL: lock release FAILED — item may be stuck in 'processing', manual reset required",
      { order_item_id: itemId, release_context: context, code: error.code, message: error.message },
    );
    return "db_error";
  }
  if (!data || data.length === 0) {
    // Fencing check failed: the lock is no longer ours to release. Another
    // request has taken ownership (or the row already advanced). Exit cleanly.
    console.warn(
      "[vendor-approve-return] lock release skipped — ownership changed, another request now owns this item",
      { order_item_id: itemId, release_context: context },
    );
    return "ownership_changed";
  }
  return "released";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, req);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401, req);

    // ---- Input ----
    let payload: unknown;
    try { payload = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400, req); }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return json({ error: "Invalid JSON payload structure" }, 400, req);
    }
    const orderItemId = (payload as { order_item_id?: string })?.order_item_id;
    if (!orderItemId || typeof orderItemId !== "string") {
      return json({ error: "order_item_id is required" }, 400, req);
    }

    // Idempotency key identifying THIS logical operation attempt. A retry of the
    // same operation (client resend after a network drop) carries the same key
    // and may resume; a different key on an in-flight item is a genuine conflict.
    // When the caller supplies none we generate a random one — it can never match
    // a stored key, so keyless requests fail closed (409) on in-flight items.
    const bodyKey = (payload as { idempotency_key?: unknown })?.idempotency_key;
    const headerKey = req.headers.get("Idempotency-Key");
    const rawKey = typeof bodyKey === "string" ? bodyKey : headerKey;
    if (rawKey != null && (rawKey.length === 0 || rawKey.length > 128)) {
      return json({ error: "idempotency_key must be 1-128 characters" }, 400, req);
    }
    const idempotencyKey = rawKey ?? crypto.randomUUID();

    // ---- Razorpay creds ----
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) return json({ error: "Razorpay credentials not configured" }, 500, req);
    const rzpAuth = "Basic " + btoa(`${keyId}:${keySecret}`);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ============================================================
    // ATOMIC LOCK — transition requested → processing, stamping the
    // idempotency key of the request that now owns the lock. No prior
    // SELECT. If another invocation already owns it (or the item is past
    // 'requested') this matches 0 rows and we fall through to the
    // resume/conflict decision below.
    // ============================================================
    const { data: locked, error: lockErr } = await service
      .from("order_items")
      .update({ return_status: "processing", return_lock_key: idempotencyKey })
      .eq("id", orderItemId)
      .eq("return_status", "requested")
      .select(LOCK_COLUMNS)
      .maybeSingle();

    if (lockErr) {
      // DB failure acquiring the lock — infrastructure error, not a conflict.
      // Nothing was locked, so there is nothing to release.
      console.error("[vendor-approve-return] lock acquisition query FAILED", {
        order_item_id: orderItemId,
        code: lockErr.code,
        message: lockErr.message,
      });
      return json({ error: "Internal server error" }, 500, req);
    }

    let item = locked;

    if (!item) {
      // 0 rows updated: the item is not in 'requested'. It may be an already
      // in-flight operation that THIS request is legitimately retrying, or a
      // genuine conflict. Read the current row to decide.
      const { data: existing, error: existingErr } = await service
        .from("order_items")
        .select(LOCK_COLUMNS)
        .eq("id", orderItemId)
        .maybeSingle();

      if (existingErr) {
        console.error("[vendor-approve-return] lock-state lookup FAILED", {
          order_item_id: orderItemId,
          code: existingErr.code,
          message: existingErr.message,
        });
        return json({ error: "Internal server error" }, 500, req);
      }

      const isProcessing = existing?.return_status === "processing";
      const keyMatches = !!existing?.return_lock_key && existing.return_lock_key === idempotencyKey;

      if (isProcessing && keyMatches) {
        // Same operation retrying — resume it. The Razorpay steps below are each
        // guarded by the persisted reversal/refund ids, so already-completed work
        // is skipped rather than repeated.
        console.log("[vendor-approve-return] resuming in-flight operation for matching idempotency key", {
          order_item_id: orderItemId,
        });
        item = existing;
      } else {
        console.log("[vendor-approve-return] lock conflict — not requested, or in-flight under a different key", {
          order_item_id: orderItemId,
          current_status: existing?.return_status ?? null,
          key_matches: keyMatches,
        });
        // Surface a machine-readable errorCode so the UI can distinguish a
        // genuine lock conflict (another request owns the row) from other 409s
        // and decide whether to retry or refresh the return list.
        const isStaleState = existing?.return_status !== "processing";
        return json({
          error: "Return is not in requested state or is already being processed",
          errorCode: isStaleState ? "RETURN_NOT_PENDING" : "ROW_LOCKED_BY_ANOTHER_REQUEST",
          retryable: !isStaleState,
        }, 409, req);
      }
    }

    // ---- Authorize BEFORE moving money ----
    const { data: vendor, error: vendorErr } = await service
      .from("vendors")
      .select("id, user_id, is_commission_exempt")
      .eq("id", item.vendor_id)
      .maybeSingle();
    if (vendorErr) {
      console.error("[vendor-approve-return] vendor DB lookup error", vendorErr.code, vendorErr.message);
      // Roll back the lock so a retry can re-enter.
      await releaseLock(service, item.id, idempotencyKey, "vendor-db-lookup-error");
      return json({ error: "Internal server error" }, 500, req);
    }
    if (!vendor) {
      console.error("[vendor-approve-return] vendor row not found for id", item.vendor_id);
      // Roll back the lock so a retry can re-enter.
      await releaseLock(service, item.id, idempotencyKey, "vendor-not-found");
      return json({ error: "Vendor not found" }, 404, req);
    }
    if (vendor.user_id !== user.id) {
      await releaseLock(service, item.id, idempotencyKey, "caller-not-vendor-owner");
      return json({ error: "Forbidden" }, 403, req);
    }

    // ---- Amounts ----
    const linePaise = Math.round(Number(item.price) * Number(item.quantity) * 100);
    if (!Number.isFinite(linePaise) || linePaise <= 0) {
      await releaseLock(service, item.id, idempotencyKey, "invalid-line-amount");
      return json({ error: "Invalid line amount" }, 400, req);
    }

    // ---- Commission — MUST be resolved BEFORE any DB writes or gateway calls ----
    // Fail loudly if the configuration is absent or out of range. A silent fallback
    // to 0% would incorrectly refund 100% of the line value to the customer.
    const { data: settingsRows, error: settingsErr } = await service
      .from("platform_settings")
      .select("key, value")
      .eq("key", "commission");
    if (settingsErr) {
      // DB failure — NOT the same as "commission not configured". Abort; do not
      // fall back to a default commission value.
      console.error("[vendor-approve-return] platform_settings lookup FAILED", {
        order_item_id: item.id,
        code: settingsErr.code,
        message: settingsErr.message,
      });
      await releaseLock(service, item.id, idempotencyKey, "commission-db-lookup-error");
      return json({ error: "Internal server error" }, 500, req);
    }
    if (!settingsRows || settingsRows.length === 0) {
      // Query succeeded but the commission setting row is absent — configuration
      // is missing, which is a distinct failure from a DB outage. Fail closed.
      console.error("[vendor-approve-return] commission configuration missing in platform_settings", {
        order_item_id: item.id,
      });
      await releaseLock(service, item.id, idempotencyKey, "commission-config-missing");
      return json({ error: "Commission configuration unavailable or invalid. Aborting." }, 500, req);
    }
    let commissionEnabled = false, commissionPct = 0;
    for (const row of settingsRows as { value: { enabled?: boolean; percentage?: number | string } }[]) {
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
      await releaseLock(service, item.id, idempotencyKey, "commission-computation-threw");
      return json({ error: "Commission configuration unavailable or invalid. Aborting." }, 500, req);
    }
    if (pct == null || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      console.error("[vendor-approve-return] commission out of range", { pct, vendor_id: item.vendor_id });
      await releaseLock(service, item.id, idempotencyKey, "commission-out-of-range");
      return json({ error: "Commission configuration unavailable or invalid. Aborting." }, 500, req);
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
          success: false,
          error: "Return processing failed. Please try again or contact support.",
          retryable: true,
        }, 502, req);
      }
      reversalId = (await revRes.json())?.id ?? null;

      const { error: revPersistErr }  = await service
        .from("order_items")
        .update({ razorpay_reversal_id: reversalId })
        .eq("id", item.id);
      if (revPersistErr) {
        console.error(
          "[vendor-approve-return] reversal succeeded but id persist FAILED — reconcile manually",
          { order_item_id: item.id, reversal_id: reversalId, code: revPersistErr.code },
        );
        return json({
          success: false,
          error: "Return processing failed. Please try again or contact support.",
          retryable: true,
        }, 500, req);
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
      const { data: payment, error: paymentErr } = await service
        .from("payments")
        .select("id, razorpay_payment_id, payment_method")
        .eq("order_id", item.order_id)
        .not("razorpay_payment_id", "is", null)
        .maybeSingle();

      if (paymentErr) {
        // DB/query failure — must NOT be treated as "payment not found" (which
        // would silently skip the customer refund after the transfer reversal).
        // Safe to release the lock: any completed reversal already has its id
        // persisted (persist failure aborts earlier), so a retry skips it.
        console.error("[vendor-approve-return] payment lookup FAILED — aborting before refund", {
          order_item_id: item.id,
          order_id: item.order_id,
          reversal_id: reversalId,
          code: paymentErr.code,
          message: paymentErr.message,
        });
        await releaseLock(service, item.id, idempotencyKey, "payment-db-lookup-error");
        return json({
          success: false,
          error: "Return processing failed. Please try again or contact support.",
          retryable: true,
        }, 500, req);
      }

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
            success: false,
            error: "Return processing failed. Please try again or contact support.",
            retryable: true,
          }, 502, req);
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
          return json({
            success: false,
            error: "Return processing failed. Please try again or contact support.",
            retryable: true,
          }, 500, req);
        }
      }
    }

    // ============================================================
    // STEP 3 — DB reversal via RPC (transitions processing → approved)
    // ============================================================
    const { error: rpcErr } = await service.rpc("vendor_approve_return", { _order_item_id: item.id, _caller_vendor_id: item.vendor_id });
    if (rpcErr) {
      console.error(
        "[vendor-approve-return] Razorpay steps done but vendor_approve_return RPC FAILED — DB reversal pending",
        { order_item_id: item.id, reversal_id: reversalId, refund_id: refundId, code: (rpcErr as { code?: string }).code, message: rpcErr.message },
      );
      return json({
        success: false,
        error: "Return processing failed. Please try again or contact support.",
        retryable: true,
      }, 500, req);
    }

    return json({
      ok: true,
      order_item_id: item.id,
      reversal_id: reversalId,
      refund_id: refundId,
      reversed_amount_paise: transferProcessed ? vendorSharePaise : 0,
      refunded_amount_paise: refundId ? linePaise : 0,
    }, 200, req);
  } catch (err) {
    console.error("[vendor-approve-return] unexpected error", (err as Error).message);
    return json({ error: "Internal server error" }, 500, req);
  }
});
