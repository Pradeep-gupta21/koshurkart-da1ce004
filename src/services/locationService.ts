import { supabase } from "@/integrations/supabase/client";
import { cacheService } from "./cacheService";
import { logger } from "@/lib/logger";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/location`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SERVICEABILITY_TTL = 600; // 10 min
const LOCAL_DEALS_TTL = 300; // 5 min
const PINCODE_LOOKUP_TTL = 3600; // 1 hour — pincodes are static
const REVERSE_GEO_TTL = 3600; // 1 hour
const DETECT_DEDUPE_MS = 30_000;

// In-flight dedupe for detect() — multiple early callers share one promise
let detectInflight: { promise: Promise<unknown>; expiresAt: number } | null = null;

export interface DetectedLocation {
  pincode: string | null;
  city: string | null;
  state: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  source: "ip" | "fallback" | "manual" | "saved" | "geo";
}

export interface PincodeInfo {
  serviceable: boolean;
  pincode?: string;
  city?: string;
  state?: string | null;
  country?: string;
  region_zone?: string;
  cod_available?: boolean;
  base_delivery_days?: number;
  surcharge_pct?: number;
}

export interface UserLocation {
  id: string;
  user_id: string;
  label: string;
  pincode: string;
  city: string;
  state: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
}

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${FUNCTIONS_URL}/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Location ${path} failed (${res.status})`);
  return res.json();
}

export const locationService = {
  async detect(): Promise<DetectedLocation> {
    const now = Date.now();
    if (detectInflight && detectInflight.expiresAt > now) {
      return detectInflight.promise as Promise<DetectedLocation>;
    }
    const promise = fetchJson("detect").catch((e) => {
      logger.error("locationService.detect", "IP detect failed", e);
      throw e;
    });
    detectInflight = { promise, expiresAt: now + DETECT_DEDUPE_MS };
    return promise as Promise<DetectedLocation>;
  },

  async reverseGeocode(lat: number, lng: number): Promise<DetectedLocation> {
    // Round to 3 decimals (~110m) for cache hit-rate, respects Nominatim policy
    const rLat = Math.round(lat * 1000) / 1000;
    const rLng = Math.round(lng * 1000) / 1000;
    const cacheKey = `loc:reverse:${rLat}:${rLng}`;
    const cached = cacheService.get<DetectedLocation>(cacheKey);
    if (cached) return cached;
    try {
      const res = await fetchJson("reverse-geocode", {
        method: "POST",
        body: JSON.stringify({ lat, lng }),
      });
      cacheService.set(cacheKey, res, REVERSE_GEO_TTL);
      return res;
    } catch (e) {
      logger.error("locationService.reverseGeocode", "Reverse geocode failed", e);
      throw e;
    }
  },

  async lookup(pincode: string): Promise<PincodeInfo> {
    const cacheKey = `loc:lookup:${pincode}`;
    const cached = cacheService.get<PincodeInfo>(cacheKey);
    if (cached) return cached;
    try {
      const res = await fetchJson("lookup", {
        method: "POST",
        body: JSON.stringify({ pincode }),
      });
      cacheService.set(cacheKey, res, PINCODE_LOOKUP_TTL);
      return res;
    } catch (e) {
      logger.error("locationService.lookup", "Pincode lookup failed", { pincode, error: e });
      throw e;
    }
  },

  async cities(q: string): Promise<Array<{ city: string; state: string; pincode: string }>> {
    return fetchJson(`cities?q=${encodeURIComponent(q)}`);
  },

  async suggestions(q: string): Promise<Array<{ city: string; state: string; pincode: string }>> {
    return fetchJson(`suggestions?q=${encodeURIComponent(q)}`);
  },

  async checkServiceability(pincode: string, productIds: string[]) {
    const sortedIds = [...productIds].sort();
    const cacheKey = `serviceability:${pincode}:${sortedIds.join(",")}`;
    const cached = cacheService.get<Array<{
      product_id: string;
      deliverable: boolean;
      eta_days: number | null;
      surcharge_pct: number;
      cod: boolean;
    }>>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase.rpc("check_serviceability" as any, {
      _pincode: pincode,
      _product_ids: productIds,
    });
    if (error) throw error;
    const result = (data ?? []) as Array<{
      product_id: string;
      deliverable: boolean;
      eta_days: number | null;
      surcharge_pct: number;
      cod: boolean;
    }>;
    cacheService.set(cacheKey, result, SERVICEABILITY_TTL);
    return result;
  },

  async getLocalDeals(pincode: string | null, limit = 8) {
    const cacheKey = `local-deals:${pincode ?? "global"}:${limit}`;
    const cached = cacheService.get<any[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase.rpc("get_local_deals" as any, {
      _pincode: pincode,
      _limit: limit,
    });
    if (error) throw error;
    const result = data ?? [];
    cacheService.set(cacheKey, result, LOCAL_DEALS_TTL);
    return result;
  },

  invalidateLocationCaches() {
    cacheService.invalidatePattern("serviceability:");
    cacheService.invalidatePattern("local-deals:");
  },

  async listUserLocations(): Promise<UserLocation[]> {
    const { data, error } = await supabase
      .from("user_locations" as any)
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as UserLocation[];
  },

  async addUserLocation(loc: Omit<UserLocation, "id" | "user_id" | "created_at">) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("user_locations" as any)
      .insert({ ...loc, user_id: user.id } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as UserLocation;
  },

  async setDefault(id: string) {
    const { error } = await supabase
      .from("user_locations" as any)
      .update({ is_default: true } as any)
      .eq("id", id);
    if (error) throw error;
  },

  async updateUserLocation(id: string, updates: { label?: string }) {
    const { data, error } = await supabase
      .from("user_locations" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as UserLocation;
  },

  async deleteUserLocation(id: string) {
    const { error } = await supabase.from("user_locations" as any).delete().eq("id", id);
    if (error) throw error;
  },
};
