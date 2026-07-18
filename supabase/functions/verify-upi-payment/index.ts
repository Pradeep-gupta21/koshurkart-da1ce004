import { createClient } from "@supabase/supabase-js";
import { validateActionRequest } from "../_shared/validation.ts";
import { handleRpcError } from "../_shared/rpcErrorMapper.ts";
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Vary": "Origin",
  };
}

const json = (body: unknown, status = 200, req: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

interface Body {
  paymentId: string;
  orderId: string;
  action: "approve" | "reject";
  transactionId?: string;
  note?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, req);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate JWT and extract user
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401, req);
    const userId = userData.user.id;

    // Service-role client for admin check + writes
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) {
      const mappedErr = handleRpcError(roleErr, "Failed to verify admin role");
      return json({ error: mappedErr.error }, mappedErr.status, req);
    }
    if (!isAdmin) return json({ error: "Forbidden: admin only" }, 403, req);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, req);
    }

    const valErr = validateActionRequest(body, true);
    if (valErr) {
      return json(valErr, 400, req);
    }

    // Verify payment exists and is UPI before executing transition (defense in depth)
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, order_id, payment_method, payment_status")
      .eq("id", body.paymentId)
      .eq("order_id", body.orderId)
      .maybeSingle();

    if (payErr) {
      console.error("[verify-upi-payment] payment DB lookup error", payErr.code, payErr.message);
      return json({ error: "Internal server error" }, 500, req);
    }
    if (!payment) return json({ error: "Payment not found" }, 404, req);
    if (payment.payment_method !== "upi") return json({ error: "Not a UPI payment" }, 400, req);

    // Call secure, atomic database transaction for payment verification
    const { data: result, error: rpcErr } = await admin.rpc("admin_process_payment", {
      p_payment_id: body.paymentId,
      p_admin_id: userId,
      p_action: body.action,
      p_transaction_id: body.transactionId || null,
      p_note: body.note || null,
    });

    if (rpcErr) {
      const mappedErr = handleRpcError(rpcErr);
      if (mappedErr.status === 500) {
        console.error("[verify-upi-payment] admin_process_payment RPC error:", rpcErr.code, rpcErr.message);
      }
      return json({ error: mappedErr.error }, mappedErr.status, req);
    }

    return json({ success: true, ...result }, 200, req);
  } catch (err) {
    console.error("[verify-upi-payment] unexpected error:", (err as Error).message);
    return json({ error: "Internal server error" }, 500, req);
  }
});
