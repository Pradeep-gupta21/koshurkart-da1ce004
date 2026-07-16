// Razorpay webhook — server-side backup to client verification.
// Configure in Razorpay Dashboard → Settings → Webhooks with events:
//   payment.captured, payment.failed, transfer.processed, transfer.failed,
//   refund.processed, refund.failed
// Set the webhook secret as RAZORPAY_WEBHOOK_SECRET.
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
};

async function verifyWebhookSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let m = 0;
  for (let i = 0; i < expected.length; i++) m |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return m === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const signature = req.headers.get("x-razorpay-signature");
    const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!signature || !secret) {
      return new Response(JSON.stringify({ error: "Missing signature or secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const valid = await verifyWebhookSignature(rawBody, signature, secret);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(rawBody);
    const eventType: string = event?.event ?? "";

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Razorpay Route transfer events (per-vendor payout tracking) ----
    // Structurally different from payment.* events (no payment entity), so they
    // are handled up front. create-checkout stamps notes.order_id + notes.vendor_id
    // on every Route transfer it creates, which is how we match a transfer back
    // to our order_items line(s). One transfer aggregates a vendor's whole
    // subtotal for an order, so it can span multiple order_items rows.
    if (eventType === "transfer.processed" || eventType === "transfer.failed") {
      const transfer = event?.payload?.transfer?.entity;
      const transferId: string | undefined = transfer?.id;
      const transferEventId: string | undefined = event?.id ?? transferId;
      if (!transfer || !transferEventId) {
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Dedupe: insert into webhook_events; if duplicate (PK conflict) → already processed
      const transferDedupeKey = `${eventType}:${transferEventId}`;
      const { error: tDedupeErr } = await service
        .from("webhook_events")
        .insert({
          provider_event_id: transferDedupeKey,
          provider: "razorpay",
          event_type: eventType,
          payload: event,
        });
      if (tDedupeErr && (tDedupeErr as { code?: string }).code === "23505") {
        return new Response(JSON.stringify({ ok: true, deduped: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const notesOrderId: string | undefined = transfer?.notes?.order_id;
      const notesVendorId: string | undefined = transfer?.notes?.vendor_id;
      const transferStatus: string = transfer?.status; // 'processed' | 'failed'
      const transferError = eventType === "transfer.failed" ? (transfer?.error ?? null) : null;

      // Update every order_items row for this (order, vendor). .select() lets us
      // detect the no-match anomaly from the returned row count.
      const { data: updatedItems, error: updErr } = await service
        .from("order_items")
        .update({
          razorpay_transfer_id: transferId,
          transfer_status: transferStatus,
          transfer_processed_at: new Date().toISOString(),
          transfer_error: transferError,
        })
        .eq("order_id", notesOrderId)
        .eq("vendor_id", notesVendorId)
        .select("id");
      if (updErr) console.error("Webhook: order_items transfer update failed", updErr.code);

      if (!updatedItems || updatedItems.length === 0) {
        // No line item matched — log the anomaly the same way payment_amount_mismatch
        // does (analytics_events + log_payment_event), then return 200 so Razorpay
        // stops retrying.
        await service.from("analytics_events").insert({
          event_type: "transfer_orphan",
          metadata: {
            source: "webhook",
            event: eventType,
            transfer_id: transferId,
            order_id: notesOrderId,
            vendor_id: notesVendorId,
            status: transferStatus,
          },
        });
        const { data: orphanPay } = await service
          .from("payments")
          .select("id")
          .eq("order_id", notesOrderId)
          .maybeSingle();
        if (orphanPay) {
          await service.rpc("log_payment_event", {
            p_payment_id: orphanPay.id,
            p_event_type: "webhook_transfer_orphan",
            p_message: `No order_items matched ${eventType} transfer`,
            p_metadata: { transfer_id: transferId, vendor_id: notesVendorId },
          });
        }
        return new Response(JSON.stringify({ ok: true, found: false }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // On failure, reuse the Phase-2 flag so the payment shows a transfer issue.
      if (eventType === "transfer.failed") {
        await service.from("payments")
          .update({ has_transfer_issues: true })
          .eq("order_id", notesOrderId);
      }

      const { data: transferPay } = await service
        .from("payments")
        .select("id")
        .eq("order_id", notesOrderId)
        .maybeSingle();
      if (transferPay) {
        await service.rpc("log_payment_event", {
          p_payment_id: transferPay.id,
          p_event_type: eventType === "transfer.failed" ? "webhook_transfer_failed" : "webhook_transfer_processed",
          p_message: `Route transfer ${transferStatus} via Razorpay webhook`,
          p_metadata: { transfer_id: transferId, vendor_id: notesVendorId, error: transferError },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Razorpay refund events (Phase 5: return refund tracking) ----
    if (eventType === "refund.processed" || eventType === "refund.failed") {
      const refund = event?.payload?.refund?.entity;
      const refundId: string | undefined = refund?.id;
      if (!refundId) {
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        if (eventType === "refund.processed") {
          await service
            .from("order_items")
            .update({ return_refunded_at: new Date().toISOString() })
            .eq("razorpay_refund_id", refundId)
            .throwOnError();
        } else {
          const { data: failedItems } = await service
            .from("order_items")
            .update({
              transfer_status: "refund_failed",
              transfer_error: refund?.reason_code ?? null,
            })
            .eq("razorpay_refund_id", refundId)
            .select("order_id")
            .throwOnError();

          const orderIds = [...new Set((failedItems ?? []).map((r: { order_id: string }) => r.order_id))];
          if (orderIds.length > 0) {
            await service
              .from("payments")
              .update({ has_transfer_issues: true })
              .in("order_id", orderIds)
              .throwOnError();
          }
        }

        const { error: rDedupeErr } = await service
          .from("webhook_events")
          .insert({
            provider_event_id: `${eventType}:${refundId}`,
            provider: "razorpay",
            event_type: eventType,
            payload: event,
          });
        if ((rDedupeErr as { code?: string } | null)?.code === "23505") {
          return new Response(JSON.stringify({ ok: true, deduped: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (rDedupeErr) throw rDedupeErr;

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (refundErr) {
        console.error("Webhook: refund handling error", (refundErr as Error).message);
        return new Response(JSON.stringify({ error: "transient_failure" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const eventId: string | undefined = event?.id ?? event?.payload?.payment?.entity?.id;
    const payment = event?.payload?.payment?.entity;
    if (!payment || !eventId) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedupe: insert into webhook_events; if duplicate (PK conflict) → already processed
    const dedupeKey = `${eventType}:${eventId}`;
    const { error: dedupeErr } = await service
      .from("webhook_events")
      .insert({
        provider_event_id: dedupeKey,
        provider: "razorpay",
        event_type: eventType,
        payload: event,
      });
    if (dedupeErr && (dedupeErr as { code?: string }).code === "23505") {
      // Try to log the duplicate against the payment row, if found
      const { data: dupPay } = await service
        .from("payments")
        .select("id")
        .eq("razorpay_order_id", payment?.order_id)
        .maybeSingle();
      if (dupPay) {
        await service.rpc("log_payment_event", {
          p_payment_id: dupPay.id,
          p_event_type: "webhook_duplicate",
          p_message: `Duplicate ${eventType} webhook ignored`,
          p_metadata: { event_id: eventId },
        });
      }
      return new Response(JSON.stringify({ ok: true, deduped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const razorpayOrderId: string = payment.order_id;
    const razorpayPaymentId: string = payment.id;
    const paidAmount: number = Number(payment.amount); // paise
    const paidCurrency: string = payment.currency;

    const { data: paymentRow, error: findErr } = await service
      .from("payments")
      .select("id, order_id, payment_status, amount")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (findErr || !paymentRow) {
      console.error("Webhook: payment row not found");
      return new Response(JSON.stringify({ ok: true, found: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Amount + currency check before flipping status
    const expectedPaise = Math.round(Number(paymentRow.amount) * 100);
    const amountOk = paidAmount === expectedPaise && paidCurrency === "INR";

    if (eventType === "payment.captured") {
      if (!amountOk) {
        await service.from("analytics_events").insert({
          event_type: "payment_amount_mismatch",
          metadata: {
            source: "webhook",
            payment_id: paymentRow.id,
            expected_paise: expectedPaise,
            actual_paise: paidAmount,
            currency: paidCurrency,
          },
        });
        await service.rpc("log_payment_event", {
          p_payment_id: paymentRow.id,
          p_event_type: "webhook_mismatch",
          p_message: "Captured amount/currency does not match",
          p_metadata: { expected_paise: expectedPaise, actual_paise: paidAmount, currency: paidCurrency },
        });
        return new Response(JSON.stringify({ ok: true, mismatch: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (paymentRow.payment_status !== "success") {
        const { error: upErr } = await service.from("payments").update({
          payment_status: "success",
          razorpay_payment_id: razorpayPaymentId,
          transaction_id: razorpayPaymentId,
          webhook_confirmed_at: new Date().toISOString(),
        }).eq("id", paymentRow.id);

        // 23505 = client verify already won the race; safe to ignore
        if (upErr && (upErr as { code?: string }).code !== "23505") {
          console.error("Webhook: payment update failed", upErr.code);
        }

        await service.from("orders").update({
          payment_status: "completed",
          order_status: "confirmed",
          reconciliation_flagged: false,
          reconciliation_reason: null,
        }).eq("id", paymentRow.order_id);

        await service.rpc("log_payment_event", {
          p_payment_id: paymentRow.id,
          p_event_type: "webhook_captured",
          p_message: "Payment captured via Razorpay webhook",
          p_metadata: { razorpay_payment_id: razorpayPaymentId, amount_paise: paidAmount },
        });
      } else {
        // Client verify already won the race — stamp confirmation + clear any flag
        await service.from("payments")
          .update({ webhook_confirmed_at: new Date().toISOString() })
          .eq("id", paymentRow.id)
          .is("webhook_confirmed_at", null);
        await service.from("orders")
          .update({ reconciliation_flagged: false, reconciliation_reason: null })
          .eq("id", paymentRow.order_id)
          .eq("reconciliation_flagged", true);
        await service.rpc("log_payment_event", {
          p_payment_id: paymentRow.id,
          p_event_type: "webhook_captured_noop",
          p_message: "Webhook captured received but payment already success",
          p_metadata: { razorpay_payment_id: razorpayPaymentId },
        });
      }
    } else if (eventType === "payment.failed") {
      if (paymentRow.payment_status !== "success") {
        await service.from("payments").update({ payment_status: "failed" }).eq("id", paymentRow.id);
        await service.from("orders").update({ payment_status: "failed" }).eq("id", paymentRow.order_id);
        await service.rpc("log_payment_event", {
          p_payment_id: paymentRow.id,
          p_event_type: "webhook_failed",
          p_message: "Payment failed via Razorpay webhook",
          p_metadata: { razorpay_payment_id: razorpayPaymentId, error: payment?.error_description ?? null },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
