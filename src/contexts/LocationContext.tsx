import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, ReactNode } from "react";
import { locationService, DetectedLocation, UserLocation } from "@/services/locationService";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

const STORAGE_KEY = "nexus_location";

export interface ActiveLocation {
  pincode: string | null;
  city: string | null;
  state: string | null;
  country: string;
  source: DetectedLocation["source"];
}

interface LocationContextValue {
  location: ActiveLocation | null;
  /** Convenience accessor — derived from location.state. */
  userState: string | null;
  savedLocations: UserLocation[];
  isDetecting: boolean;
  isServiceable: boolean | null;
  setLocationByPincode: (pincode: string) => Promise<{ ok: boolean; message?: string }>;
  detectAuto: () => Promise<void>;
  refreshSaved: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

function readStored(): ActiveLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActiveLocation) : null;
  } catch {
    return null;
  }
}

function persist(loc: ActiveLocation | null) {
  if (loc) localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  else localStorage.removeItem(STORAGE_KEY);
}

export const LocationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [location, setLocation] = useState<ActiveLocation | null>(() => readStored());
  const [savedLocations, setSavedLocations] = useState<UserLocation[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isServiceable, setIsServiceable] = useState<boolean | null>(null);
  const detectFailToastShown = useRef(false);

  const detectAuto = useCallback(async () => {
    setIsDetecting(true);
    let gpsTried = false;
    let gpsFailed = false;
    try {
      // 1) Try precise GPS first (browser prompts user)
      const gps = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!("geolocation" in navigator)) return resolve(null);
        gpsTried = true;
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          () => { gpsFailed = true; resolve(null); },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
        );
      });

      let d: DetectedLocation | null = null;
      if (gps) {
        try {
          d = await locationService.reverseGeocode(gps.coords.latitude, gps.coords.longitude);
        } catch (e) {
          logger.error("LocationContext.detectAuto", "reverse geocode failed; trying IP", e);
          gpsFailed = true;
        }
      }
      // 2) Fallback to server IP detection
      if (!d) {
        try {
          d = await locationService.detect();
        } catch (e) {
          logger.error("LocationContext.detectAuto", "IP detect failed after GPS path", e);
          // Both paths failed — show one-time toast
          if ((gpsTried && gpsFailed) && !detectFailToastShown.current) {
            detectFailToastShown.current = true;
            toast.error("Couldn't detect your location", {
              description: "Please enter your pincode manually.",
            });
          }
          return;
        }
      }

      const next: ActiveLocation = {
        pincode: d.pincode,
        city: d.city,
        state: d.state,
        country: d.country ?? "IN",
        source: d.source,
      };
      setLocation(next);
      persist(next);
    } catch (e) {
      logger.error("LocationContext.detectAuto", "unexpected failure", e);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const setLocationByPincode = useCallback(async (pincode: string) => {
    let info;
    try {
      info = await locationService.lookup(pincode);
    } catch (e) {
      logger.error("LocationContext.setLocationByPincode", "lookup failed", e);
      setIsServiceable(null);
      return { ok: false, message: "We couldn't verify this pincode right now. Please try again." };
    }
    if (!info.serviceable) {
      setIsServiceable(false);
      return { ok: false, message: "We don't deliver to this pincode yet." };
    }
    const next: ActiveLocation = {
      pincode: info.pincode!,
      city: info.city!,
      state: info.state ?? null,
      country: info.country ?? "IN",
      source: "manual",
    };
    setLocation(next);
    persist(next);
    locationService.invalidateLocationCaches();
    setIsServiceable(true);
    if (user) {
      try {
        await locationService.addUserLocation({
          label: "Recent",
          pincode: next.pincode!,
          city: next.city!,
          state: next.state,
          country: next.country,
          lat: null,
          lng: null,
          is_default: savedLocations.length === 0,
        });
        await refreshSaved();
      } catch (_) { /* ignore - non-blocking */ }
    }
    return { ok: true };
  }, [user, savedLocations.length]);

  const refreshSaved = useCallback(async () => {
    if (!user) { setSavedLocations([]); return; }
    try {
      const list = await locationService.listUserLocations();
      setSavedLocations(list);
      const def = list.find((l) => l.is_default);
      if (def && (!location || location.pincode !== def.pincode)) {
        const next: ActiveLocation = {
          pincode: def.pincode, city: def.city, state: def.state,
          country: def.country, source: "saved",
        };
        setLocation(next);
        persist(next);
      }
    } catch (e) {
      logger.error("LocationContext.refreshSaved", "failed to load saved locations", e);
    }
  }, [user, location]);

  // First load: if no stored location, try auto-detect
  useEffect(() => {
    if (!location) detectAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On auth change, load saved locations
  useEffect(() => {
    refreshSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Recheck serviceability when pincode changes
  useEffect(() => {
    if (!location?.pincode) { setIsServiceable(null); return; }
    locationService.lookup(location.pincode)
      .then((i) => setIsServiceable(!!i.serviceable))
      .catch(() => setIsServiceable(null));
  }, [location?.pincode]);

  const value = useMemo<LocationContextValue>(() => ({
    location, userState: location?.state ?? null, savedLocations, isDetecting, isServiceable,
    setLocationByPincode, detectAuto, refreshSaved,
  }), [location, savedLocations, isDetecting, isServiceable, setLocationByPincode, detectAuto, refreshSaved]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
