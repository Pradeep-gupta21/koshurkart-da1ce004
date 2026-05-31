// Test-only helper — builds a signed Razorpay webhook payload and POSTs it to
// the real razorpay-webhook function so we can verify the captured/failed flow
// end-to-end without driving the live Razorpay modal.
//
// Authorization: caller must be the authenticated owner of the target payment
// row (its `user_id` must equal `auth.uid()`). This means it can only be used
// to simulate a webhook for a payment you personally initiated, which limits
// abuse to self-targeting test rows.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { payment_id, event = "payment.captured", error_description } = await req.json();
    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: pay, error: payErr } = await service
      .from("payments")
      .select("id, user_id, amount, razorpay_order_id, payment_status")
      .eq("id", payment_id)
      .maybeSingle();
    if (payErr || !pay) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pay.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!pay.razorpay_order_id) {
      return new Response(JSON.stringify({ error: "Payment has no razorpay_order_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountPaise = Math.round(Number(pay.amount) * 100);
    const simulatedPaymentId = `pay_TEST${Math.random().toString(36).slice(2, 14)}`;
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
            id: simulatedPaymentId,
            entity: "payment",
            amount: amountPaise,
            currency: "INR",
            status: event === "payment.captured" ? "captured" : "failed",
            order_id: pay.razorpay_order_id,
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
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: rawBody,
    });
    const text = await res.text();

    return new Response(
      JSON.stringify({
        webhook_status: res.status,
        webhook_response: text,
        signed_event_id: eventId,
        simulated_payment_id: simulatedPaymentId,
        amount_paise: amountPaise,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
