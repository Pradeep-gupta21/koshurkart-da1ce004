

User wants Amazon-style location with backend integration. Stack note: project is **Vite + React + Supabase** (not Next.js, no Express, no Mongo, no Zustand). I'll map their request to this stack — same architecture, native tools. Already have `currencyService` doing IP geolocation (ipapi.co), so partial infra exists.

## Scope

1. **Auto-detect** location on first visit (IP → coords + pincode + city)
2. **Manual override** via pincode or city search
3. **Persist** per-user (DB) + per-guest (localStorage)
4. **Affect** product availability, delivery ETA, shipping cost
5. **Header UI** showing "Deliver to {city} {pincode}" with click-to-change modal

## 1. Database

**New tables:**

`user_locations` — saved addresses per user
- id, user_id (auth.users), label ('Home'/'Office'/custom), pincode, city, state, country, lat, lng, is_default, created_at
- RLS: users CRUD their own only

`serviceable_pincodes` — coverage map
- pincode (PK), city, state, country, region_zone ('metro'|'tier1'|'tier2'|'remote'), cod_available, base_delivery_days, surcharge_pct, is_active
- RLS: public SELECT, admin manages

`vendor_serviceability` — per-vendor pincode rules (optional override)
- vendor_id, pincode_pattern (e.g. '110%' for Delhi), ships, delivery_days_override
- RLS: public SELECT, vendor manages own

`profiles` — add `default_pincode text` column

**Seed:** ~30 representative Indian pincodes covering metros + tiers so feature works out of the box.

**RPC `check_serviceability(_pincode, _product_ids[])`** returns per-product `{ deliverable, eta_days, surcharge_pct, cod }` — single call from PDP/cart.

## 2. Backend (edge function)

`supabase/functions/location/index.ts`
- `GET /location/detect` → IP → ipapi.co lookup → reverse-geocode pincode (best-effort; ipapi returns postal) → returns `{ pincode, city, state, country, lat, lng, source: 'ip' }`
- `POST /location/lookup` → body `{ pincode }` → returns serviceability + city/state from `serviceable_pincodes` (404 if unserviceable)
- `GET /location/cities?q=` → autocomplete from distinct city names

Cache IP results 24h in-memory (LRU 1000 entries) keyed by IP. Zod validation. CORS.

## 3. Frontend state — `LocationContext`

`src/contexts/LocationContext.tsx` — global provider exposing:
```ts
{ location, setLocation, savedLocations, isDetecting, isServiceable }
```
- On mount: read localStorage → if empty, call `/location/detect` → save to localStorage
- If user signs in: merge guest location into `user_locations`, load saved, set default
- `setLocation(pincode)` → calls `/location/lookup` → updates state + persists (DB if auth, localStorage always)

Choosing **Context** over Zustand/Redux — project already uses Context (`Cart`, `Currency`, `Sidebar`); adding a new state lib would be inconsistent.

## 4. UI

**`LocationPill`** in `Header.tsx` (left of search): icon + "Deliver to {city} {pincode}" → opens `LocationDialog`.

**`LocationDialog`** modal:
- Tab 1: Pincode input → validate → preview city → confirm
- Tab 2: City autocomplete (debounced)
- Tab 3 (auth only): Saved addresses list with default selector + "Add new"
- "Use my location" button → browser Geolocation API → reverse-geocode via edge function

**`ServiceabilityBadge`** on `ProductCard` + `ProductDetailPage`:
- Green: "Delivery by {date}" 
- Amber: "Available, ships in 7+ days"
- Red: "Not deliverable to {pincode}"

**Cart/Checkout integration:**
- Block checkout if any item unserviceable to selected pincode
- Show per-item ETA + surcharge in cart summary
- `CheckoutForm` pre-fills shipping address from `user_locations.is_default`

## 5. Pricing impact

Extend `pricingService.getDisplayPrice(product, location)` to apply `surcharge_pct` from pincode zone. Already have currency conversion — add a thin zone-multiplier step.

## 6. Files

**Create**
- `supabase/migrations/<ts>_location_system.sql` — 3 tables, RLS, RPC, seed
- `supabase/functions/location/index.ts` — detect/lookup/cities
- `src/contexts/LocationContext.tsx`
- `src/components/location/LocationPill.tsx`
- `src/components/location/LocationDialog.tsx`
- `src/components/location/ServiceabilityBadge.tsx`
- `src/services/locationService.ts` — client wrapper
- `src/lib/validators/locationSchema.ts` — Zod (pincode regex per country)

**Modify**
- `src/App.tsx` — wrap in `LocationProvider`
- `src/components/layout/Header.tsx` — mount `LocationPill`
- `src/components/product/ProductCard.tsx` — render `ServiceabilityBadge`
- `src/pages/ProductDetailPage.tsx` — full serviceability block + ETA
- `src/pages/CartPage.tsx` + `src/pages/CheckoutPage.tsx` — block unserviceable, show ETA, prefill address
- `src/components/forms/CheckoutForm.tsx` — bind to default saved location
- `src/services/pricingService.ts` — apply zone surcharge
- `supabase/config.toml` — `verify_jwt = false` for `location` (detect must work for guests)

## 7. Out of scope
- Google Maps API (ipapi.co + pincode DB is sufficient and free; user can swap later by changing one function)
- Real-time courier API integration (existing `courier_api_config` column already there for future)
- Multi-country pincode formats beyond IN/US (architecture supports it; only seeding IN now)

