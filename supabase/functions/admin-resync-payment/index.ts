// Admin tool: re-fetches a payment from Razorpay and reconciles status server-side.
// Admin-only via has_role check.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await anon.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await anon.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { paymentId } = await req.json();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: "paymentId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      return new Response(JSON.stringify({ error: "Razorpay credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment, error: payErr } = await service
      .from("payments")
      .select("id, order_id, amount, payment_status, razorpay_order_id, razorpay_payment_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payment.razorpay_order_id) {
      return new Response(JSON.stringify({ error: "Payment has no Razorpay order id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = "Basic " + btoa(`${keyId}:${keySecret}`);

    // Fetch all payments for the Razorpay order
    const rpRes = await fetch(
      `https://api.razorpay.com/v1/orders/${payment.razorpay_order_id}/payments`,
      { headers: { Authorization: auth } },
    );
    if (!rpRes.ok) {
      const t = await rpRes.text();
      console.error("Razorpay fetch failed", rpRes.status, t);
      return new Response(JSON.stringify({ error: "Razorpay fetch failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rpBody = await rpRes.json();
    const rpPayments: any[] = rpBody?.items ?? [];
    const captured = rpPayments.find((p) => p.status === "captured");
    const expectedPaise = Math.round(Number(payment.amount) * 100);

    let newStatus = payment.payment_status;
    let updateFields: Record<string, unknown> = {};

    if (captured) {
      if (captured.amount !== expectedPaise || captured.currency !== "INR") {
        await service.rpc("log_payment_event", {
          p_payment_id: payment.id,
          p_event_type: "admin_resync_mismatch",
          p_message: "Admin re-sync found amount/currency mismatch",
          p_metadata: { expected_paise: expectedPaise, actual_paise: captured.amount, currency: captured.currency },
        });
        return new Response(JSON.stringify({ ok: false, mismatch: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      newStatus = "success";
      updateFields = {
        payment_status: "success",
        razorpay_payment_id: captured.id,
        transaction_id: captured.id,
      };
    } else if (rpPayments.some((p) => p.status === "failed")) {
      newStatus = "failed";
      updateFields = { payment_status: "failed" };
    } else {
      await service.rpc("log_payment_event", {
        p_payment_id: payment.id,
        p_event_type: "admin_resync_no_change",
        p_message: "Razorpay reports no terminal status yet",
        p_metadata: { gateway_payments: rpPayments.length },
      });
      return new Response(JSON.stringify({ ok: true, changed: false, status: payment.payment_status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (newStatus !== payment.payment_status) {
      const { error: upErr } = await service.from("payments").update(updateFields).eq("id", payment.id);
      if (upErr) {
        console.error("Update failed", upErr);
        return new Response(JSON.stringify({ error: "Update failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (newStatus === "success") {
        await service.from("orders").update({
          payment_status: "completed",
          order_status: "confirmed",
        }).eq("id", payment.order_id);
      } else if (newStatus === "failed") {
        await service.from("orders").update({ payment_status: "failed" }).eq("id", payment.order_id);
      }
    }

    await service.rpc("log_payment_event", {
      p_payment_id: payment.id,
      p_event_type: "admin_resync",
      p_message: `Admin re-synced payment; new status: ${newStatus}`,
      p_metadata: { previous: payment.payment_status, new: newStatus, actor: user.id },
    });

    return new Response(JSON.stringify({ ok: true, status: newStatus, changed: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-resync-payment error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
