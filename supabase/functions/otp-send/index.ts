import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{9,14}$/, "Phone must be E.164 (e.g. +919876543210)"),
});

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

// Best-effort in-memory rate limit (per cold start)
const buckets = new Map<string, { count: number; reset: number }>();
function hit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCode() {
  // 6-digit, leading zeros allowed
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { phone } = parsed.data;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    // In-memory per-cold-start guard
    if (!hit(`send:phone:${phone}`, 3, 30_000)) {
      return new Response(JSON.stringify({ error: "Please wait before requesting another code." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!hit(`send:ip:${ip}`, 20, 60_000)) {
      return new Response(JSON.stringify({ error: "Too many requests." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persistent server-side rate limit (sliding window via Postgres)
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: allowedPhone } = await serviceSupabase.rpc("check_auth_rate_limit", {
      _identifier: `phone:${phone}`, _action: "otp_send", _max_attempts: 5, _window_seconds: 600,
    });
    if (allowedPhone === false) {
      return new Response(JSON.stringify({ error: "Too many OTP requests for this number. Try again in 10 minutes." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: allowedIp } = await serviceSupabase.rpc("check_auth_rate_limit", {
      _identifier: `ip:${ip}`, _action: "otp_send", _max_attempts: 30, _window_seconds: 600,
    });
    if (allowedIp === false) {
      return new Response(JSON.stringify({ error: "Too many OTP requests from this network." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured (connect Twilio in Lovable)");
    if (!TWILIO_FROM_NUMBER) throw new Error("TWILIO_FROM_NUMBER is not configured");

    const supabase = serviceSupabase;

    // Generate and persist hashed OTP (10 min TTL)
    const code = generateCode();
    const code_hash = await sha256Hex(code);
    const expires_at = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error: upErr } = await supabase
      .from("phone_otps")
      .upsert({ phone, code_hash, attempts: 0, expires_at }, { onConflict: "phone" });
    if (upErr) throw new Error(`Failed to persist OTP: ${upErr.message}`);


    // Send SMS via Twilio gateway
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone,
        From: TWILIO_FROM_NUMBER,
        Body: `Your verification code is ${code}. It expires in 10 minutes.`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Twilio send failed", res.status, data);
      await supabase.rpc("log_auth_event", {
        _user_id: null, _email: null, _event_type: "otp_send", _success: false,
        _ip: ip, _user_agent: req.headers.get("user-agent"),
        _metadata: { phone, twilio_status: res.status },
      });
      throw new Error(`Twilio error [${res.status}]: ${data?.message ?? JSON.stringify(data)}`);
    }

    await supabase.rpc("log_auth_event", {
      _user_id: null, _email: null, _event_type: "otp_send", _success: true,
      _ip: ip, _user_agent: req.headers.get("user-agent"),
      _metadata: { phone },
    });


    return new Response(JSON.stringify({ ok: true, provider: "twilio" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("otp-send error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
