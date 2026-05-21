import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{9,14}$/, "Phone must be E.164 (e.g. +919876543210)"),
});

// best-effort in-memory rate limit (per cold start)
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

async function getProvider(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "otp_provider")
    .maybeSingle();
  const raw = (data?.value ?? "supabase") as unknown;
  const p = typeof raw === "string" ? raw : (raw as { provider?: string })?.provider ?? "supabase";
  return ["supabase", "twilio", "msg91", "firebase"].includes(p) ? p : "supabase";
}

async function sendViaSupabase(supabase: ReturnType<typeof createClient>, phone: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw new Error(error.message);
}

async function sendViaTwilio(phone: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const verifySid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
  if (!sid || !token || !verifySid) throw new Error("Twilio not configured");
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${verifySid}/Verifications`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, Channel: "sms" }),
    },
  );
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
}

async function sendViaMsg91(phone: string) {
  const key = Deno.env.get("MSG91_AUTH_KEY");
  const tpl = Deno.env.get("MSG91_TEMPLATE_ID");
  if (!key || !tpl) throw new Error("MSG91 not configured");
  const res = await fetch(
    `https://control.msg91.com/api/v5/otp?template_id=${tpl}&mobile=${encodeURIComponent(phone.replace("+", ""))}`,
    { method: "POST", headers: { authkey: key } },
  );
  if (!res.ok) throw new Error(`MSG91 error ${res.status}: ${await res.text()}`);
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const provider = await getProvider(supabase);
    if (provider === "twilio") await sendViaTwilio(phone);
    else if (provider === "msg91") await sendViaMsg91(phone);
    else if (provider === "firebase") throw new Error("Firebase provider not yet enabled");
    else await sendViaSupabase(supabase, phone);

    return new Response(JSON.stringify({ ok: true, provider }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
