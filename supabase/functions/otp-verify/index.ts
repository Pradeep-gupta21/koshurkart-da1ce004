import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{9,14}$/),
  code: z.string().regex(/^\d{4,8}$/),
});

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { phone, code } = parsed.data;
    if (!hit(`verify:${phone}`, 5, 5 * 60_000)) {
      return new Response(JSON.stringify({ error: "Too many attempts. Request a new code." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const provider = await getProvider(supabase);

    // For Supabase provider, verification happens client-side (so a session cookie can be set).
    // We return the directive; client calls supabase.auth.verifyOtp directly.
    if (provider === "supabase") {
      return new Response(JSON.stringify({ ok: true, provider, clientVerify: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (provider === "twilio") {
      const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const token = Deno.env.get("TWILIO_AUTH_TOKEN");
      const verifySid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
      if (!sid || !token || !verifySid) throw new Error("Twilio not configured");
      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${verifySid}/VerificationCheck`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: phone, Code: code }),
        },
      );
      const data = await res.json();
      if (!res.ok || data.status !== "approved") {
        return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (provider === "msg91") {
      const key = Deno.env.get("MSG91_AUTH_KEY");
      if (!key) throw new Error("MSG91 not configured");
      const res = await fetch(
        `https://control.msg91.com/api/v5/otp/verify?otp=${code}&mobile=${encodeURIComponent(phone.replace("+", ""))}`,
        { method: "GET", headers: { authkey: key } },
      );
      const data = await res.json();
      if (!res.ok || data.type !== "success") {
        return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      throw new Error(`Provider ${provider} not yet enabled`);
    }

    // Mint a Supabase session for the verified phone using admin API.
    // Find existing user by phone or create one.
    const { data: list } = await supabase.auth.admin.listUsers();
    let user = list.users.find((u) => u.phone === phone.replace("+", ""));
    if (!user) {
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        phone: phone.replace("+", ""),
        phone_confirm: true,
      });
      if (cErr) throw new Error(cErr.message);
      user = created.user!;
    }
    const { data: link, error: lErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: user.email ?? `${user.id}@phone.local`,
    });
    if (lErr) throw new Error(lErr.message);

    return new Response(
      JSON.stringify({
        ok: true,
        provider,
        actionLink: link.properties?.action_link,
        userId: user.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
