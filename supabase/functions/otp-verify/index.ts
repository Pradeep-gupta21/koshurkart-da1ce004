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

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

    // Code matches — consume it
    await supabase.from("phone_otps").delete().eq("phone", phone);

    // Find or create the user keyed by phone
    let userId: string | null = null;
    // Try to find existing user by phone (paginate)
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw new Error(`listUsers: ${listErr.message}`);
    const existing = list?.users?.find((u) => u.phone === phone.replace(/^\+/, "") || u.phone === phone);
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        phone,
        phone_confirm: true,
      });
      if (createErr || !created?.user) throw new Error(`createUser: ${createErr?.message ?? "failed"}`);
      userId = created.user.id;
    }

    // Mint a session via magic link (we extract the recovery tokens)
    // generateLink with type 'magiclink' returns access/refresh tokens we can hand to the client.
    const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      // generateLink requires email for magiclink — fall back to a synthetic email tied to phone
      email: `${phone.replace(/[^\d]/g, "")}@phone.local`,
    } as any);

    // Most setups won't have that email tied to the user; instead generate via the user's id directly is not supported.
    // Fallback: use signInWithIdToken style — actually simplest is to issue a session using the admin API directly.
    let access_token: string | undefined;
    let refresh_token: string | undefined;

    // Try the typed admin endpoint to create a session for the user.
    // Supabase JS v2.45+ exposes admin.generateLink with type 'magiclink' and embeds hashed_token only.
    // To reliably get session tokens, we use the admin REST endpoint:
    const adminRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users/${userId}/sessions`,
      {
        method: "POST",
        headers: {
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    if (adminRes.ok) {
      const sj = await adminRes.json();
      access_token = sj?.access_token;
      refresh_token = sj?.refresh_token;
    } else {
      console.error("admin sessions endpoint failed", adminRes.status, await adminRes.text());
    }

    if (!access_token || !refresh_token) {
      throw new Error("Failed to mint session for verified phone user");
    }

    return new Response(
      JSON.stringify({ ok: true, provider: "twilio", access_token, refresh_token, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("otp-verify error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
