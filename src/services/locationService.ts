import { supabase } from "@/integrations/supabase/client";
import { cacheService } from "./cacheService";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/location`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SERVICEABILITY_TTL = 600; // 10 min
const LOCAL_DEALS_TTL = 300; // 5 min

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
    return fetchJson("detect");
  },

  async reverseGeocode(lat: number, lng: number): Promise<DetectedLocation> {
    return fetchJson("reverse-geocode", {
      method: "POST",
      body: JSON.stringify({ lat, lng }),
    });
  },

  async lookup(pincode: string): Promise<PincodeInfo> {
    return fetchJson("lookup", {
      method: "POST",
      body: JSON.stringify({ pincode }),
    });
  },

  async cities(q: string): Promise<Array<{ city: string; state: string; pincode: string }>> {
    return fetchJson(`cities?q=${encodeURIComponent(q)}`);
  },

  async suggestions(q: string): Promise<Array<{ city: string; state: string; pincode: string }>> {
    return fetchJson(`suggestions?q=${encodeURIComponent(q)}`);
  },

  async checkServiceability(pincode: string, productIds: string[]) {
    const { data, error } = await supabase.rpc("check_serviceability" as any, {
      _pincode: pincode,
      _product_ids: productIds,
    });
    if (error) throw error;
    return (data ?? []) as Array<{
      product_id: string;
      deliverable: boolean;
      eta_days: number | null;
      surcharge_pct: number;
      cod: boolean;
    }>;
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
