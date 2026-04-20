import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";

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
  const startedAt = Date.now();
  const log = (status: number, extra: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({
      fn: "location", action: path, method: req.method, status,
      durationMs: Date.now() - startedAt, ...extra,
    }));
  };

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
        log(400, { reason: "invalid_pincode" });
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
      // Best-effort usage tracking
      void supabase.rpc("record_analytics_event", {
        _event_type: "location_lookup",
        _metadata: { pincode: parsed.data.pincode, serviceable: !!data },
      });
      if (!data) {
        log(200, { pincode: parsed.data.pincode, serviceable: false });
        return new Response(JSON.stringify({ serviceable: false, pincode: parsed.data.pincode }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      log(200, { pincode: parsed.data.pincode, serviceable: true });
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

    // POST reverse-geocode { lat, lng } — uses Nominatim (OpenStreetMap)
    if (req.method === "POST" && path === "reverse-geocode") {
      const body = await req.json().catch(() => ({}));
      const lat = Number(body?.lat);
      const lng = Number(body?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return new Response(JSON.stringify({ error: "Invalid coordinates" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { "User-Agent": "Lovable-Location/1.0 (contact@lovable.dev)", "Accept-Language": "en" } },
        );
        if (!r.ok) throw new Error(`nominatim ${r.status}`);
        const j = await r.json();
        const a = j.address ?? {};
        const result = {
          pincode: a.postcode ?? null,
          city: a.city ?? a.town ?? a.village ?? a.suburb ?? a.county ?? null,
          state: a.state ?? null,
          country: (a.country_code ?? "in").toUpperCase(),
          lat, lng,
          source: "geo" as const,
        };
        // Best-effort usage tracking
        void supabase.rpc("record_analytics_event", {
          _event_type: "location_lookup",
          _metadata: { kind: "reverse_geocode", pincode: result.pincode, country: result.country },
        });
        log(200, { kind: "reverse_geocode", pincode: result.pincode });
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error(JSON.stringify({ fn: "location", action: "reverse-geocode", err: (e as Error).message }));
        log(502, { error: (e as Error).message });
        return new Response(JSON.stringify({ error: "Reverse geocoding failed" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // GET suggestions?q=  — unified pincode + city + state autocomplete
    if (req.method === "GET" && path === "suggestions") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const isNumeric = /^\d+$/.test(q);
      let query = supabase
        .from("serviceable_pincodes")
        .select("city, state, pincode")
        .eq("is_active", true)
        .limit(8);
      if (isNumeric) {
        query = query.ilike("pincode", `${q}%`);
      } else {
        // match city OR state (prefix-insensitive)
        query = query.or(`city.ilike.${q}%,state.ilike.${q}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify(data ?? []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log(404);
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(JSON.stringify({ fn: "location", action: path, err: (e as Error).message }));
    log(500, { error: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
