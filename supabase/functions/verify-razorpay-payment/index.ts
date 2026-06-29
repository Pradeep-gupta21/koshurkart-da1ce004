import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function redact(s: string | null | undefined): string {
  if (!s) return "";
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}***${s.slice(-2)}`;
}

async function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode(`${orderId}|${paymentId}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time compare
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId, orderId } =
      await req.json();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !paymentId || !orderId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      return new Response(JSON.stringify({ error: "Razorpay credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isValid = await verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature, keySecret);
    if (!isValid) {
      console.error("Signature verification failed for order", redact(razorpayOrderId));
      return new Response(
        JSON.stringify({ error: "Payment verification failed: invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch local payment + order; never trust client-supplied amounts
    const { data: paymentRow, error: payFetchErr } = await service
      .from("payments")
      .select("id, order_id, user_id, amount, payment_status, razorpay_payment_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (payFetchErr || !paymentRow) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (paymentRow.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (paymentRow.order_id !== orderId) {
      return new Response(JSON.stringify({ error: "Order mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: already success
    if (paymentRow.payment_status === "success") {
      return new Response(
        JSON.stringify({ success: true, message: "Already verified", idempotent: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch the Razorpay order to verify the captured amount + currency
    const rpRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}`, {
      headers: { Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
    });
    if (!rpRes.ok) {
      console.error("Razorpay order fetch failed", rpRes.status);
      return new Response(JSON.stringify({ error: "Could not verify gateway order" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rpOrder = await rpRes.json();

    // Razorpay order status must be 'paid' once the user finishes the modal flow.
    // 'attempted' or 'created' means the user closed it before capture.
    if (rpOrder.status !== "paid") {
      console.error("Razorpay order not paid", { rpOrderId: razorpayOrderId, status: rpOrder.status });
      return new Response(JSON.stringify({ error: "Payment not captured by gateway" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedPaise = Math.round(Number(paymentRow.amount) * 100);
    if (rpOrder.amount !== expectedPaise || rpOrder.currency !== "INR") {
      console.error("Amount/currency mismatch", { expectedPaise, got: rpOrder.amount });
      await service.from("analytics_events").insert({
        event_type: "payment_amount_mismatch",
        user_id: user.id,
        metadata: {
          payment_id: paymentId,
          expected_paise: expectedPaise,
          actual_paise: rpOrder.amount,
          currency: rpOrder.currency,
        },
      });
      return new Response(JSON.stringify({ error: "Payment amount mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update payment — unique index on razorpay_payment_id + one_success_per_order
    // protects against races. 23505 means another writer (e.g. webhook) won.
    const { error: payErr } = await service
      .from("payments")
      .update({
        payment_status: "success",
        razorpay_payment_id: razorpayPaymentId,
        razorpay_order_id: razorpayOrderId,
        razorpay_signature: razorpaySignature,
        transaction_id: razorpayPaymentId,
      })
      .eq("id", paymentId);

    if (payErr) {
      // Duplicate (already credited via webhook) → treat as success
      if ((payErr as { code?: string }).code === "23505") {
        return new Response(
          JSON.stringify({ success: true, idempotent: true, message: "Already settled" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("Payment update failed", payErr.code);
      return new Response(JSON.stringify({ error: "Failed to update payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: ordErr } = await service
      .from("orders")
      .update({ payment_status: "completed", order_status: "confirmed" })
      .eq("id", orderId);
    if (ordErr) console.error("Order update failed", ordErr.code);

    await service.rpc("log_payment_event", {
      p_payment_id: paymentId,
      p_event_type: "verify_success",
      p_message: "Client-side verify completed and signature validated",
      p_metadata: { razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Razorpay Route split — 7% platform commission stays in our main
    // account, remaining 93% is transferred to each vendor's linked account
    // (pro-rated by vendor subtotal). Linked vendors without a configured
    // `razorpay_account_id` are skipped and logged so they can be paid out
    // manually. Failure here does NOT roll back the payment — the customer
    // has already paid; transfer is a settlement detail.
    // ─────────────────────────────────────────────────────────────────────
    try {
      const PLATFORM_FEE_PCT = 0.07;

      const { data: itemRows } = await service
        .from("order_items")
        .select("vendor_id, quantity, price, total_price")
        .eq("order_id", orderId);

      const perVendor = new Map<string, number>();
      for (const r of (itemRows ?? []) as any[]) {
        if (!r.vendor_id) continue;
        const line = Number(r.total_price ?? Number(r.price) * Number(r.quantity));
        perVendor.set(r.vendor_id, (perVendor.get(r.vendor_id) ?? 0) + line);
      }

      if (perVendor.size > 0) {
        const vendorIds = [...perVendor.keys()];
        const { data: vendorRows } = await service
          .from("vendors")
          .select("id, razorpay_account_id, store_name, is_commission_exempt")
          .in("id", vendorIds);

        const transfers: Array<{ account: string; amount: number; currency: string; notes: Record<string, string> }> = [];
        const skipped: Array<{ vendor_id: string; reason: string }> = [];

        for (const v of (vendorRows ?? []) as any[]) {
          const vendorSubtotal = perVendor.get(v.id) ?? 0;
          if (vendorSubtotal <= 0) continue;
          // Influencer / commission-exempt vendors keep 100% of their subtotal.
          const feePct = v.is_commission_exempt ? 0 : PLATFORM_FEE_PCT;
          const vendorShare = vendorSubtotal * (1 - feePct);
          const amountPaise = Math.round(vendorShare * 100);
          if (!v.razorpay_account_id) {
            skipped.push({ vendor_id: v.id, reason: "missing razorpay_account_id" });
            continue;
          }
          if (amountPaise < 100) {
            skipped.push({ vendor_id: v.id, reason: "share below minimum ₹1" });
            continue;
          }
          transfers.push({
            account: v.razorpay_account_id,
            amount: amountPaise,
            currency: "INR",
            notes: { order_id: orderId, vendor_id: v.id, vendor_name: v.store_name ?? "", commission_exempt: v.is_commission_exempt ? "true" : "false" },
          });
        }

        if (transfers.length > 0) {
          const tRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}/transfers`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
            },
            body: JSON.stringify({ transfers }),
          });
          const tBody = await tRes.json().catch(() => ({}));
          if (!tRes.ok) {
            console.error("Razorpay Route transfer failed", tRes.status, tBody?.error?.description);
          }
          await service.rpc("log_payment_event", {
            p_payment_id: paymentId,
            p_event_type: tRes.ok ? "route_transfer_success" : "route_transfer_failed",
            p_message: tRes.ok ? "Route split transfers created" : `Route transfer error: ${tBody?.error?.description ?? tRes.status}`,
            p_metadata: { transfers, skipped, response_status: tRes.status },
          });
        } else if (skipped.length > 0) {
          await service.rpc("log_payment_event", {
            p_payment_id: paymentId,
            p_event_type: "route_transfer_skipped",
            p_message: "No eligible vendors for Route transfer",
            p_metadata: { skipped },
          });
        }
      }
    } catch (transferErr) {
      console.error("Route split error:", (transferErr as Error).message);
    }


    return new Response(
      JSON.stringify({ success: true, message: "Payment verified and confirmed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("verify-razorpay-payment error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
