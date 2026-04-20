

User wants the location pill to show the user's **exact** location automatically, not just IP-based approximation.

## Current state
- `LocationContext.detect()` is only called when the user clicks "Use current location" in the dialog.
- On first load, the pill shows nothing (or last saved location from localStorage).
- GPS is attempted via `navigator.geolocation`, but reverse-geocoding currently maps lat/lng → pincode using a coarse lookup (or falls back to IP).

## Plan — auto-detect exact location on first visit

### 1. Auto-trigger detection on app load
In `LocationContext`, add a `useEffect` that runs once on mount:
- If a location already exists in `localStorage` → skip (respect user's choice).
- Else → silently call `detect()` which already tries GPS first, then IP fallback.
- No toast on silent auto-detect (only show errors if both fail).

### 2. Improve GPS → address accuracy (reverse geocoding)
Currently GPS returns lat/lng but mapping to a precise city + pincode is weak. Add a proper reverse-geocoding step in the `location` edge function:
- New action: `POST { action: "reverse-geocode", lat, lng }`
- Uses **Nominatim (OpenStreetMap)** — free, no API key, returns city/state/postcode/country from coordinates
- Returns normalized `{ pincode, city, state, country, lat, lng, source: "geo" }`
- Client `LocationContext.detect()` calls this after `getCurrentPosition` succeeds, instead of the current coarse mapping.

### 3. Permission UX
- First load: silently request GPS (browser shows native prompt).
- If user **denies** → fall back to server IP detect (no error toast, just less precise).
- If user **allows** → exact street-level city + pincode shown in pill.
- Add a small "Detecting…" state on the `LocationPill` while initial detection runs.

### 4. Pill display
Already shows `City PIN` — no change needed; just ensure it updates after auto-detect resolves.

## Files to edit
- `supabase/functions/location/index.ts` — add `reverse-geocode` action calling Nominatim
- `src/services/locationService.ts` — add `reverseGeocode(lat, lng)` wrapper
- `src/contexts/LocationContext.tsx` — auto-detect on mount (if no saved location); use `reverseGeocode` after GPS success
- `src/components/location/LocationPill.tsx` — show "Detecting location…" placeholder while initial detect is in flight

## Out of scope
- Google Maps Geocoding API (requires paid key; Nominatim is sufficient and free, with a usage policy we comply with via low volume + UA header)
- Background re-detection on every visit (respect saved location)
- Asking permission via custom UI before native prompt (adds friction; native prompt is standard)

