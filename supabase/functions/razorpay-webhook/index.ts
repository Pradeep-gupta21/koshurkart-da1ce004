// Razorpay webhook — server-side backup to client verification.
// Configure in Razorpay Dashboard → Settings → Webhooks with events:
//   payment.captured, payment.failed
// Set the webhook secret as RAZORPAY_WEBHOOK_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
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
  return expected === signature;
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
    const payment = event?.payload?.payment?.entity;
    if (!payment) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const razorpayOrderId: string = payment.order_id;
    const razorpayPaymentId: string = payment.id;

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the matching payment row by razorpay_order_id
    const { data: paymentRow, error: findErr } = await service
      .from("payments")
      .select("id, order_id, payment_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (findErr || !paymentRow) {
      console.error("Webhook: payment row not found", razorpayOrderId, findErr);
      // Still ack so Razorpay stops retrying
      return new Response(JSON.stringify({ ok: true, found: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventType === "payment.captured") {
      // Idempotent: trigger on_payment_success guards via credited_at
      if (paymentRow.payment_status !== "success") {
        await service.from("payments").update({
          payment_status: "success",
          razorpay_payment_id: razorpayPaymentId,
          transaction_id: razorpayPaymentId,
        }).eq("id", paymentRow.id);

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
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
