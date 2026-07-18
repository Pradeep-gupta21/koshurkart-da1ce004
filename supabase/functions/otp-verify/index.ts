import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function phoneToSyntheticEmail(phone: string) {
  return `${phone.replace(/[^\d]/g, "")}@phone.local`;
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

    // Look up stored OTP
    const { data: row, error: selErr } = await supabase
      .from("phone_otps")
      .select("code_hash, attempts, expires_at")
      .eq("phone", phone)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!row) {
      return new Response(JSON.stringify({ error: "No code requested for this number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabase.from("phone_otps").delete().eq("phone", phone);
      return new Response(JSON.stringify({ error: "Code expired. Request a new one." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((row.attempts ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: "Too many attempts. Request a new code." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const incoming_hash = await sha256Hex(code);
    if (incoming_hash !== row.code_hash) {
      await supabase
        .from("phone_otps")
        .update({ attempts: (row.attempts ?? 0) + 1 })
        .eq("phone", phone);
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Code valid — consume
    await supabase.from("phone_otps").delete().eq("phone", phone);

    // Find or create the user keyed by phone (use a synthetic email so we can mint a magic-link token)
    const syntheticEmail = phoneToSyntheticEmail(phone);

    // Try to find by email (synthetic) — listUsers paginated
    let userId: string | null = null;
    for (let page = 1; page <= 10 && !userId; page++) {
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) throw new Error(`listUsers: ${listErr.message}`);
      const found = list?.users?.find(
        (u) => u.email === syntheticEmail || u.phone === phone || u.phone === phone.replace(/^\+/, ""),
      );
      if (found) userId = found.id;
      if (!list?.users || list.users.length < 200) break;
    }

    if (!userId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        phone,
        phone_confirm: true,
        user_metadata: {
          terms_accepted: true,
          signup_method: "phone_otp",
          phone,
        },
      });
      if (createErr || !created?.user) {
        console.error("otp-verify createUser failed:", JSON.stringify(createErr), "status:", (createErr as any)?.status);
        throw new Error(`createUser: ${createErr?.message || (createErr as any)?.code || "unknown error"}`);
      }
      userId = created.user.id;
    }


    // Generate a magic-link token; client converts it to a session via verifyOtp({ token_hash, type: 'magiclink' })
    const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error(`generateLink failed: ${linkErr?.message ?? "no token"}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        provider: "twilio",
        token_hash: link.properties.hashed_token,
        type: "magiclink",
        user_id: userId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("otp-verify error:", msg, stack);
    return new Response(JSON.stringify({ error: "Verification failed. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

});
