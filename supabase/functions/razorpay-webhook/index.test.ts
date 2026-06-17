// Razorpay webhook dedup + state-transition test.
//
// Posts the same valid-signature payload twice and asserts:
//   1. First POST returns 200 with no `deduped` flag.
//   2. Second POST returns 200 with `deduped: true`.
//   3. Exactly ONE `webhook_captured` payment_log row was created.
//   4. The payment row was flipped to `success` exactly once and stamped
//      with `webhook_confirmed_at`.
//
// Requires the following env vars (skips gracefully if missing):
//   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
//   SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_WEBHOOK_SECRET
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");

const FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/razorpay-webhook` : "";

const canRun = !!(SUPABASE_URL && SERVICE_ROLE && WEBHOOK_SECRET && ANON);

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
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

Deno.test("razorpay-webhook: duplicate captured event is deduped and only one state transition occurs", async () => {
  if (!canRun) {
    console.warn(
      "Skipping: requires VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, " +
        "RAZORPAY_WEBHOOK_SECRET, VITE_SUPABASE_PUBLISHABLE_KEY env vars.",
    );
    return;
  }

  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Seed a buyer user + order + razorpay payment row in `pending` state.
  const buyerEmail = `dedup-test-${crypto.randomUUID()}@test.koshurkart.local`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: buyerEmail,
    password: "Test-Pass-9c8f2a!",
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message}`);
  const userId = created.user.id;

  const uniqueRzpOrderId = `order_dedup_${crypto.randomUUID().slice(0, 12)}`;
  const uniqueRzpPaymentId = `pay_dedup_${crypto.randomUUID().slice(0, 12)}`;
  const amount = 1; // ₹1

  const cleanup = async () => {
    await admin.from("payments").delete().eq("razorpay_order_id", uniqueRzpOrderId);
    // orders cascade-delete payments; order_id captured below
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  };

  try {
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({ user_id: userId, total_amount: amount, payment_status: "pending", order_status: "processing" })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(`order insert failed: ${orderErr?.message}`);

    const { data: payment, error: payErr } = await admin
      .from("payments")
      .insert({
        user_id: userId,
        order_id: order.id,
        amount,
        payment_method: "razorpay",
        payment_provider: "razorpay",
        payment_status: "pending",
        razorpay_order_id: uniqueRzpOrderId,
      })
      .select("id")
      .single();
    if (payErr || !payment) throw new Error(`payment insert failed: ${payErr?.message}`);

    // 2. Build a payment.captured payload that matches the seeded payment.
    const eventId = `evt_${crypto.randomUUID().slice(0, 12)}`;
    const payload = {
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: uniqueRzpPaymentId,
            order_id: uniqueRzpOrderId,
            amount: amount * 100, // paise
            currency: "INR",
            status: "captured",
          },
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const signature = await hmacSha256Hex(WEBHOOK_SECRET!, rawBody);

    const post = () =>
      fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
          apikey: ANON!,
        },
        body: rawBody,
      });

    // 3. First POST → should process the event.
    const res1 = await post();
    const body1 = await res1.json();
    assertEquals(res1.status, 200, `first POST status: got ${res1.status}, body=${JSON.stringify(body1)}`);
    assertEquals(body1.deduped, undefined, `first POST should not be deduped: ${JSON.stringify(body1)}`);

    // 4. Second POST with identical payload → must be deduped.
    const res2 = await post();
    const body2 = await res2.json();
    assertEquals(res2.status, 200);
    assertEquals(body2.deduped, true, `second POST should be deduped: ${JSON.stringify(body2)}`);

    // 5. Verify only ONE webhook_captured log row exists for this payment.
    const { data: logs, error: logsErr } = await admin
      .from("payment_logs")
      .select("event_type")
      .eq("payment_id", payment.id)
      .eq("event_type", "webhook_captured");
    if (logsErr) throw new Error(`logs query failed: ${logsErr.message}`);
    assertEquals(logs?.length ?? 0, 1, `expected exactly 1 webhook_captured log, got ${logs?.length}`);

    // 6. Verify the duplicate path emitted a webhook_duplicate log.
    const { data: dupLogs } = await admin
      .from("payment_logs")
      .select("event_type")
      .eq("payment_id", payment.id)
      .eq("event_type", "webhook_duplicate");
    assertEquals(dupLogs?.length ?? 0, 1, `expected exactly 1 webhook_duplicate log`);

    // 7. Payment row flipped to success exactly once + webhook_confirmed_at stamped.
    const { data: paid } = await admin
      .from("payments")
      .select("payment_status, razorpay_payment_id, webhook_confirmed_at")
      .eq("id", payment.id)
      .single();
    assertEquals(paid?.payment_status, "success");
    assertEquals(paid?.razorpay_payment_id, uniqueRzpPaymentId);
    if (!paid?.webhook_confirmed_at) {
      throw new Error("webhook_confirmed_at was not stamped");
    }

    // 8. Order row was confirmed.
    const { data: ord } = await admin
      .from("orders")
      .select("order_status, payment_status")
      .eq("id", order.id)
      .single();
    assertEquals(ord?.order_status, "confirmed");
    assertEquals(ord?.payment_status, "completed");
  } finally {
    await cleanup();
  }
});

Deno.test("razorpay-webhook: bad signature returns 401 and writes no webhook_events row", async () => {
  if (!canRun) {
    console.warn("Skipping bad-signature test (missing env vars).");
    return;
  }
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const eventId = `evt_bad_${crypto.randomUUID().slice(0, 12)}`;
  const payload = {
    id: eventId,
    event: "payment.captured",
    payload: { payment: { entity: { id: eventId, order_id: "order_nope", amount: 100, currency: "INR" } } },
  };
  const rawBody = JSON.stringify(payload);

  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": "deadbeef".repeat(8),
      apikey: ANON!,
    },
    body: rawBody,
  });
  await res.text();
  assertEquals(res.status, 401);

  const { data: rows } = await admin
    .from("webhook_events")
    .select("provider_event_id")
    .eq("provider_event_id", `payment.captured:${eventId}`);
  assertEquals(rows?.length ?? 0, 0, "no webhook_events row should be written on bad signature");
});
