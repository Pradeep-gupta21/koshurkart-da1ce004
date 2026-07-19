import { createClient } from "npm:@supabase/supabase-js@2";
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  event_type: z.string().min(1).max(64),
  email: z.string().email().max(255).nullable().optional(),
  success: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  user_agent: z.string().max(512).nullable().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, parsed.error.flatten().fieldErrors, false), { ...corsHeaders, "Content-Type": "application/json" });
    }

    const { event_type, email, success, metadata, user_agent } = parsed.data;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip") ??
      null;

    // Optional auth — this endpoint logs pre-auth events (login_failure,
    // signup_failure, etc.) so we resolve the user when a valid bearer token
    // is provided but never reject anonymous calls.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (bearer && bearer !== anonKey) {
      try {
        const supabaseAuth = createClient(
          Deno.env.get("SUPABASE_URL")!,
          anonKey,
          { global: { headers: { Authorization: `Bearer ${bearer}` } } }
        );
        const { data } = await supabaseAuth.auth.getClaims(bearer);
        userId = data?.claims?.sub ?? null;
      } catch {
        userId = null;
      }
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // supabase-js reports DB failures via the returned error rather than
    // throwing — rethrow so the catch block logs it and the caller gets a
    // 500 instead of a false { ok: true }.
    const { error } = await service.rpc("log_auth_event", {
      _user_id: userId,
      _email: email ?? null,
      _event_type: event_type,
      _success: success ?? true,
      _ip: ip,
      _user_agent: user_agent ?? req.headers.get("user-agent") ?? null,
      _metadata: metadata ?? {},
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("log-auth-event error:", msg);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Internal server error", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
});
