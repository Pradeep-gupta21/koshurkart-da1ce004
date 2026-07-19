import { createClient } from "@supabase/supabase-js";
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { z } from "zod";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{9,14}$/, "Phone must be E.164 (e.g. +919876543210)"),
});

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

// Best-effort in-memory rate limit (per cold start)
const buckets = new Map<string, { count: number; reset: number }>();
function hit(key: string, max: number, windowMs: number) {
  // Fix #2: Hard boundary to prevent OOM during distributed attacks
  if (buckets.size > 5000) buckets.clear();
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
  // Fix #3: Cryptographic peppering — mirrors logic required in otp-verify
  const pepper = Deno.env.get("OTP_PEPPER");
  if (!pepper) throw new Error("OTP_PEPPER is missing");
  const data = new TextEncoder().encode(input + pepper);
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
      return respondWithError(
        new PaymentError(
          ErrorCategory.VALIDATION,
          ERROR_CODES.VALIDATION_ERROR,
          "Validation failed: " + Object.entries(parsed.error.flatten().fieldErrors)
            .map(([field, errors]) => `${field}: ${errors.join(", ")}`)
            .join("; "),
          false
        ),
        { ...corsHeaders, "Content-Type": "application/json" }
      );
    }
    const { phone } = parsed.data;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    // In-memory per-cold-start guard
    if (!hit(`send:ip:${ip}`, 20, 60_000)) {
      return respondWithError(
        new PaymentError(
          ErrorCategory.RATE_LIMIT,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "Too many requests.",
          false
        ),
        { ...corsHeaders, "Content-Type": "application/json" }
      );
    }
    if (!hit(`send:phone:${phone}`, 3, 30_000)) {
      return respondWithError(
        new PaymentError(
          ErrorCategory.RATE_LIMIT,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "Please wait before requesting another code.",
          false
        ),
        { ...corsHeaders, "Content-Type": "application/json" }
      );
    }

    // Persistent server-side rate limit (sliding window via Postgres)
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Persistent server-side rate limit — errors from the RPC itself are 500s;
    // a false return value (limit hit) is the intended 429 path.
    const { data: allowedIp, error: ipRateLimitErr } = await serviceSupabase.rpc("check_auth_rate_limit", {
      _identifier: `ip:${ip}`, _action: "otp_send", _max_attempts: 30, _window_seconds: 600,
    });
    if (ipRateLimitErr) throw new Error("Rate limiter unavailable");
    if (typeof allowedIp !== "boolean") throw new Error("Rate limiter unavailable");
    if (allowedIp === false) {
      return respondWithError(
        new PaymentError(
          ErrorCategory.RATE_LIMIT,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "Too many OTP requests from this network.",
          false
        ),
        { ...corsHeaders, "Content-Type": "application/json" }
      );
    }

    const { data: allowedPhone, error: phoneRateLimitErr } = await serviceSupabase.rpc("check_auth_rate_limit", {
      _identifier: `phone:${phone}`, _action: "otp_send", _max_attempts: 5, _window_seconds: 600,
    });
    if (phoneRateLimitErr) throw new Error("Rate limiter unavailable");
    if (typeof allowedPhone !== "boolean") throw new Error("Rate limiter unavailable");
    if (allowedPhone === false) {
      return respondWithError(
        new PaymentError(
          ErrorCategory.RATE_LIMIT,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "Too many OTP requests for this number. Try again in 10 minutes.",
          false
        ),
        { ...corsHeaders, "Content-Type": "application/json" }
      );
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


    // Send SMS via Twilio gateway.
    // The entire fetch + response evaluation is wrapped in try/catch so that
    // AbortSignal timeouts, network errors, AND !res.ok responses all
    // trigger the same scoped rollback before propagating.
    let is4xx = false;
    try {
      const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
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
        if (res.status >= 400 && res.status < 500) {
          is4xx = true;
        }
        throw new Error(`Twilio error [${res.status}]: ${data?.message ?? JSON.stringify(data)}`);
      }
    } catch (gatewayErr) {
      console.error("Twilio send failed", (gatewayErr as Error).message);
      
      // Safe OTP Rollback: Only delete the OTP record if Twilio definitively rejected it (4xx).
      // On 5xx and ambiguous network errors (ECONNRESET, ETIMEDOUT), bypass the rollback for webhook reconciliation.
      // (This prevents the user from being stuck with an invalidated OTP if the SMS actually gets delivered).
      if (is4xx) {
        // Scoped rollback: delete only the exact row written in this execution
        // instance by matching both phone AND code_hash so a concurrent
        // retry's record is not accidentally removed.
        const { error: rollbackErr } = await supabase
          .from("phone_otps")
          .delete()
          .match({ phone, code_hash });
        if (rollbackErr) {
          console.error("OTP rollback failed:", rollbackErr);
          throw new Error("OTP delivery and rollback failed", { cause: rollbackErr });
        }
      } else {
        console.warn("Twilio send failed ambiguously; leaving OTP record intact for reconciliation/retry.");
      }
      throw gatewayErr;
    }

    // Mask phone to redact PII before writing to the audit log store.
    // E.g. +919876543210 → ********3210  (all but the last 4 digits replaced).
    const maskedPhone = phone.replace(/.(?=.{4})/g, "*");
    try {
      // supabase-js surfaces DB failures via the returned error, it does not
      // throw — without this check an insert failure is silently swallowed.
      const { error } = await supabase.rpc("log_auth_event", {
        _user_id: null, _email: null, _event_type: "otp_send", _success: true,
        _ip: ip, _user_agent: req.headers.get("user-agent"),
        _metadata: { phone: maskedPhone },
      });
      if (error) throw error;
    } catch (logErr) {
      console.error("Audit log failed:", logErr);
    }


    return new Response(JSON.stringify({ ok: true, provider: "twilio" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "unknown error";
    console.error("otp-send error:", msg);
    if (msg.includes("rate") || msg.includes("throttle") || msg.includes("429")) {
      return respondWithError(
        new PaymentError(
          ErrorCategory.RATE_LIMIT,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "Gateway rate limited. Please try again later.",
          true
        ),
        { ...corsHeaders, "Content-Type": "application/json" }
      );
    }
    return respondWithError(
      new PaymentError(
        ErrorCategory.GATEWAY_ERROR,
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to send verification code. Please try again.",
        false
      ),
      { ...corsHeaders, "Content-Type": "application/json" }
    );
  }
});
