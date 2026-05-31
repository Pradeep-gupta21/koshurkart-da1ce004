// Test-only helper — builds a signed Razorpay webhook payload and POSTs it to
// the real razorpay-webhook function so we can verify the captured/failed flow
// end-to-end without driving the live Razorpay modal. Gated by TEST_BOOTSTRAP_SECRET.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;
const TEST_SECRET = Deno.env.get("TEST_BOOTSTRAP_SECRET")!;

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.headers.get("x-test-secret") !== TEST_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      razorpay_order_id,
      amount_paise,
      event = "payment.captured",
      payment_id = `pay_TEST${Math.random().toString(36).slice(2, 14)}`,
      error_description,
    } = await req.json();

    if (!razorpay_order_id || !amount_paise) {
      return new Response(
        JSON.stringify({ error: "razorpay_order_id and amount_paise are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const eventId = `evt_TEST${Math.random().toString(36).slice(2, 14)}`;
    const payload = {
      entity: "event",
      account_id: "acc_test",
      event,
      id: eventId,
      created_at: Math.floor(Date.now() / 1000),
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: payment_id,
            entity: "payment",
            amount: amount_paise,
            currency: "INR",
            status: event === "payment.captured" ? "captured" : "failed",
            order_id: razorpay_order_id,
            method: "card",
            captured: event === "payment.captured",
            error_description: error_description ?? null,
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const signature = await hmacHex(WEBHOOK_SECRET, rawBody);

    const url = `${SUPABASE_URL}/functions/v1/razorpay-webhook`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
        // Some platforms require apikey/Authorization even when verify_jwt = false
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: rawBody,
    });
    const text = await res.text();

    return new Response(
      JSON.stringify({
        status: res.status,
        webhook_response: text,
        signed_event_id: eventId,
        simulated_payment_id: payment_id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
