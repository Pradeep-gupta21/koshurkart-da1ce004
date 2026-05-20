// Razorpay webhook — server-side backup to client verification.
// Configure in Razorpay Dashboard → Settings → Webhooks with events:
//   payment.captured, payment.failed
// Set the webhook secret as RAZORPAY_WEBHOOK_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

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
    const eventId: string | undefined = event?.id ?? event?.payload?.payment?.entity?.id;
    const payment = event?.payload?.payment?.entity;
    if (!payment || !eventId) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
        }).eq("id", paymentRow.id);

        // 23505 = client verify already won the race; safe to ignore
        if (upErr && (upErr as { code?: string }).code !== "23505") {
          console.error("Webhook: payment update failed", upErr.code);
        }

        await service.from("orders").update({
          payment_status: "completed",
          order_status: "confirmed",
        }).eq("id", paymentRow.order_id);
      }
    } else if (eventType === "payment.failed") {
      if (paymentRow.payment_status !== "success") {
        await service.from("payments").update({ payment_status: "failed" }).eq("id", paymentRow.id);
        await service.from("orders").update({ payment_status: "failed" }).eq("id", paymentRow.order_id);
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
