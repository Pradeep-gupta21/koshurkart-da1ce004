// Brevo transactional email sender (via Lovable connector gateway)
// Supports two template types:
//   - order_confirmation : sent after a successful purchase
//   - return_requested   : sent when a customer submits a return request
//
// Auth: requires a valid Supabase user JWT. The function fetches the order/item
// with the service role and verifies the caller owns it before sending.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
const FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") ?? "no-reply@koshurkart.in";
const FROM_NAME = Deno.env.get("BREVO_FROM_NAME") ?? "Koshur Kart";

interface SendArgs {
  type: "order_confirmation" | "return_requested" | "customer_welcome" | "vendor_kyc_welcome";
  orderId?: string;
  orderItemId?: string;
  email?: string;
  name?: string;
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function shell(title: string, intro: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#1a1a1a">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#312e81,#4338ca);color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:20px;font-weight:700">Koshur Kart</div>
      <div style="opacity:.85;font-size:12px;letter-spacing:.12em;text-transform:uppercase">${esc(title)}</div>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e6e3dc;border-top:0">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55">${intro}</p>
      ${bodyHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#8a857d">Need help? Reply to this email or visit koshurkart.in/support</p>
    </div>
  </div></body></html>`;
}

function orderConfirmationEmail(order: any, items: any[]) {
  const rows = items
    .map(
      (i) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0ede6">${esc(i.title)} × ${i.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0ede6;text-align:right;font-variant-numeric:tabular-nums">₹${Number(i.price * i.quantity).toFixed(2)}</td>
    </tr>`,
    )
    .join("");

  const address = [order.shipping_address, order.shipping_city, order.shipping_state, order.shipping_pincode]
    .filter(Boolean)
    .join(", ");

  const body = `
    <div style="background:#eef2ff;border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:13px;color:#312e81">
      <strong>Order #${esc(order.id.slice(0, 8).toUpperCase())}</strong><br/>
      Placed on ${new Date(order.created_at).toLocaleString("en-IN")}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
      <tr><td style="padding:12px 0;font-weight:700">Total</td>
          <td style="padding:12px 0;font-weight:700;text-align:right">₹${Number(order.total_amount).toFixed(2)}</td></tr>
    </table>
    ${address ? `<div style="margin-top:18px;font-size:13px;color:#4b4843"><strong style="color:#1a1a1a">Delivering to</strong><br/>${esc(order.recipient_name ?? "")}<br/>${esc(address)}</div>` : ""}`;

  return {
    subject: `Order confirmed · #${order.id.slice(0, 8).toUpperCase()}`,
    html: shell("Order Confirmed", "Thanks for your order — we're getting it ready.", body),
  };
}

function returnRequestEmail(order: any, item: any) {
  const body = `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px;margin-bottom:18px">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#c2410c;font-weight:600">Return Reason</div>
      <div style="font-size:15px;font-weight:600;color:#7c2d12;margin-top:4px">${esc(item.return_reason ?? "—")}</div>
      ${item.return_description ? `<p style="margin:8px 0 0;color:#7c2d12;font-size:13px;white-space:pre-wrap">${esc(item.return_description)}</p>` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="color:#6b6660">Item</td><td style="text-align:right;font-weight:600">${esc(item.title)} × ${item.quantity}</td></tr>
      <tr><td style="color:#6b6660;padding-top:6px">Order</td><td style="text-align:right;font-weight:600;padding-top:6px">#${esc(order.id.slice(0, 8).toUpperCase())}</td></tr>
      <tr><td style="color:#6b6660;padding-top:6px">Requested</td><td style="text-align:right;padding-top:6px">${new Date(item.return_requested_at ?? Date.now()).toLocaleString("en-IN")}</td></tr>
    </table>
    <div style="margin-top:18px;background:#eef2ff;border-left:4px solid #4338ca;padding:12px 14px;border-radius:6px;font-size:13px;color:#312e81">
      Our team will review your request within 24 hours. You can download a printable return slip from your profile to pack with the item.
    </div>`;

  return {
    subject: `Return request received · #${order.id.slice(0, 8).toUpperCase()}`,
    html: shell("Return Requested", "We've received your return request — here's a summary for your records.", body),
  };
}

const ORDER_CONFIRMATION_TEMPLATE_ID = Number(
  Deno.env.get("BREVO_ORDER_CONFIRMATION_TEMPLATE_ID") ?? "5",
);
const CUSTOMER_WELCOME_TEMPLATE_ID = Number(
  Deno.env.get("BREVO_CUSTOMER_WELCOME_TEMPLATE_ID") ?? "1",
);
const VENDOR_KYC_WELCOME_TEMPLATE_ID = Number(
  Deno.env.get("BREVO_VENDOR_KYC_WELCOME_TEMPLATE_ID") ?? "2",
);

async function brevoSend(payload: Record<string, unknown>) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  if (!lovableKey || !brevoKey) throw new Error("Missing Brevo gateway credentials");

  const res = await fetch(`${GATEWAY_URL}/smtp/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": brevoKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function sendViaBrevo(to: string, name: string | null, subject: string, html: string) {
  return brevoSend({
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: to, name: name ?? undefined }],
    subject,
    htmlContent: html,
  });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const args = (await req.json()) as SendArgs;
    if (!args?.type) {
      return new Response(JSON.stringify({ error: "type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // -------- Public (no JWT): customer welcome --------
    // Verifies the recipient exists in auth.users and was created in last 10 minutes
    // to prevent abuse. Always returns ok to avoid email enumeration.
    if (args.type === "customer_welcome") {
      const email = (args.email ?? "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ ok: true, skipped: "invalid_email" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const user = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      if (!user) {
        return new Response(JSON.stringify({ ok: true, skipped: "user_not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const createdAt = new Date(user.created_at).getTime();
      if (Date.now() - createdAt > 10 * 60 * 1000) {
        return new Response(JSON.stringify({ ok: true, skipped: "stale_signup" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const customerName =
        (args.name && args.name.trim()) ||
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        email.split("@")[0];
      const result = await brevoSend({
        templateId: CUSTOMER_WELCOME_TEMPLATE_ID,
        to: [{ email, name: customerName }],
        params: { CUSTOMER_NAME: customerName, EMAIL: email },
      });
      console.log("email.sent", { type: args.type, templateId: CUSTOMER_WELCOME_TEMPLATE_ID, to: email });
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------- Authenticated routes below --------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    if (args.type === "vendor_kyc_welcome") {
      const { data: vendor } = await admin
        .from("vendors")
        .select("id, store_name, user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!vendor) throw new Error("Vendor not found");
      const to = userData.user.email;
      if (!to) throw new Error("No recipient email");
      const meta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
      const customerName =
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        vendor.store_name ||
        to.split("@")[0];
      const result = await brevoSend({
        templateId: VENDOR_KYC_WELCOME_TEMPLATE_ID,
        to: [{ email: to, name: customerName }],
        params: {
          CUSTOMER_NAME: customerName,
          EMAIL: to,
          STORE_NAME: vendor.store_name ?? "",
        },
      });
      console.log("email.sent", { type: args.type, templateId: VENDOR_KYC_WELCOME_TEMPLATE_ID, to });
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    if (args.type === "order_confirmation") {
      if (!args.orderId) throw new Error("orderId required");
      const { data: order, error } = await admin
        .from("orders")
        .select("*, order_items(id, title, price, quantity)")
        .eq("id", args.orderId)
        .single();
      if (error || !order) throw new Error(error?.message ?? "Order not found");
      if (order.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const to = order.recipient_email ?? userData.user.email;
      if (!to) throw new Error("No recipient email");

      const items = (order.order_items ?? []) as Array<{ title: string; price: number; quantity: number }>;
      const totalQty = items.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
      const itemNames = items.map((i) => `${i.title} × ${i.quantity}`).join(", ");
      const purchaseDate = new Date(order.created_at).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const customerName =
        order.recipient_name ??
        (userData.user.user_metadata as Record<string, unknown> | null)?.full_name ??
        to.split("@")[0];

      const params = {
        ORDER_ID: order.id.slice(0, 8).toUpperCase(),
        CUSTOMER_NAME: customerName,
        PURCHASE_DATE: purchaseDate,
        ITEM_NAME: itemNames,
        QUANTITY: totalQty,
        TOTAL_AMOUNT: `₹${Number(order.total_amount).toFixed(2)}`,
        ITEMS: items.map((i) => ({
          name: i.title,
          quantity: i.quantity,
          price: `₹${Number(i.price).toFixed(2)}`,
          total: `₹${(Number(i.price) * Number(i.quantity)).toFixed(2)}`,
        })),
      };

      const result = await brevoSend({
        templateId: ORDER_CONFIRMATION_TEMPLATE_ID,
        to: [{ email: to, name: customerName }],
        params,
      });
      console.log("email.sent", {
        type: args.type,
        orderId: args.orderId,
        templateId: ORDER_CONFIRMATION_TEMPLATE_ID,
        to,
      });
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    if (args.type === "return_requested") {
      if (!args.orderItemId) throw new Error("orderItemId required");
      const { data: item, error } = await admin
        .from("order_items")
        .select("*, orders!inner(id, user_id, recipient_email, recipient_name, created_at)")
        .eq("id", args.orderItemId)
        .single();
      if (error || !item) throw new Error(error?.message ?? "Item not found");
      const order = item.orders as any;
      if (order.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const to = order.recipient_email ?? userData.user.email;
      if (!to) throw new Error("No recipient email");
      const { subject, html } = returnRequestEmail(order, item);
      const result = await sendViaBrevo(to, order.recipient_name, subject, html);
      console.log("email.sent", { type: args.type, orderItemId: args.orderItemId, to });
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-transactional-email.error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
