import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// 24h in-memory IP cache (best effort; per edge instance)
const ipCache = new Map<string, { value: unknown; expiresAt: number }>();
const IP_TTL_MS = 24 * 60 * 60 * 1000;

const PincodeSchema = z.object({
  pincode: z.string().trim().min(3).max(10),
});

function getIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0";
}

async function detectByIp(ip: string) {
  const cached = ipCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // ipapi.co free tier; fall back to defaults if it fails
  let result: any = {
    pincode: null, city: null, state: null, country: "IN",
    lat: null, lng: null, source: "fallback",
  };
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "User-Agent": "Lovable-Location/1.0" },
    });
    if (res.ok) {
      const j = await res.json();
      result = {
        pincode: j.postal ?? null,
        city: j.city ?? null,
        state: j.region ?? null,
        country: j.country_code ?? "IN",
        lat: j.latitude ?? null,
        lng: j.longitude ?? null,
        source: "ip",
      };
    }
  } catch (_) { /* swallow - fallback */ }

  ipCache.set(ip, { value: result, expiresAt: Date.now() + IP_TTL_MS });
  // crude LRU bound
  if (ipCache.size > 1000) {
    const firstKey = ipCache.keys().next().value;
    if (firstKey) ipCache.delete(firstKey);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  try {
    // GET detect
    if (req.method === "GET" && path === "detect") {
      const ip = getIp(req);
      const detected = await detectByIp(ip);
      return new Response(JSON.stringify(detected), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST lookup
    if (req.method === "POST" && path === "lookup") {
      const body = await req.json().catch(() => ({}));
      const parsed = PincodeSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(JSON.stringify({ error: "Invalid pincode" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase
        .from("serviceable_pincodes")
        .select("*")
        .eq("pincode", parsed.data.pincode)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ serviceable: false }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ serviceable: true, ...data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET cities?q=
    if (req.method === "GET" && path === "cities") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase
        .from("serviceable_pincodes")
        .select("city, state, pincode")
        .ilike("city", `${q}%`)
        .eq("is_active", true)
        .limit(10);
      if (error) throw error;
      return new Response(JSON.stringify(data ?? []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("location error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
