

## Reality check

Most of this is already in place. Let me audit precisely.

| Spec | Status | Where |
|---|---|---|
| Cache location responses | ✅ Partial | `cacheService` wraps `checkServiceability` (10min) + `getLocalDeals` (5min); `useServiceability` also has `staleTime: 10min` via React Query. **Gap:** `lookup`, `detect`, `reverse-geocode` calls not cached. |
| Optimize API calls | ✅ | Batched serviceability lookup via `useServiceability(productIds[])` — single RPC per page; React Query dedupes. |
| Scalability / CDN | ⚠️ N/A | Edge functions already run on Supabase global edge. Nothing actionable in code — Lovable Cloud handles infra. |
| GPS denied handling | ✅ | `LocationContext.detectAuto` silently falls back to IP detect. |
| API failure handling | ⚠️ Partial | `locationService` throws on edge function errors but UI doesn't always render a graceful state (e.g. `LocalDeals` just hides on error; `useServiceability` returns empty map silently — products still work). **Gap:** no toast on persistent failures, no retry policy on React Query. |
| Invalid input | ✅ | Zod schemas in `validators/locationSchema.ts` + server-side validation in `supabase/functions/location/index.ts`. |
| Log failures | ⚠️ Partial | Edge function uses `console.error`. **Gap:** no client-side error logging — silent failures invisible. |
| Track API usage | ⚠️ Partial | `analytics_events` table exists but no `location_lookup` / `serviceability_check` events recorded. |
| Unit tests frontend | ⚠️ | Vitest configured, only `example.test.ts` + 2 navigation tests exist. **Gap:** no tests for `LocationContext`, `useServiceability`, `cacheService`, `CartContext` location math. |
| Unit tests backend | ⚠️ | Only `menu_test.ts` exists for edge functions. **Gap:** no tests for `location/index.ts`. |
| Env vars / secret storage | ✅ | All secrets in Supabase secrets vault, no hardcoded keys. Nominatim is keyless. |

## Plan — close the real gaps only

### 1. Cache the remaining location endpoints
- Wrap `locationService.lookup(pincode)` in `cacheService` — key `loc:lookup:{pincode}`, TTL 1 hour (pincodes are static).
- Wrap `locationService.reverseGeocode(lat, lng)` — key rounded to 3 decimals (~110m), TTL 1 hour. Respects Nominatim usage policy.
- Skip caching `detect()` (IP-based, varies per request) but add a 30s in-flight dedupe to prevent double-fire on first paint.

### 2. Resilient error handling
- Add React Query defaults in `useServiceability`: `retry: 2, retryDelay: exp backoff, refetchOnWindowFocus: false`.
- `LocationContext.detectAuto` already swallows errors silently — keep that, but add a one-time toast if **both** GPS and IP detect fail (currently no user feedback).
- `LocalDeals` already gracefully hides on error — fine.
- `CartContext` shipping math already returns 0 if serviceability missing — fine.

### 3. Lightweight client-side logging + usage tracking
- New `src/lib/logger.ts` — thin wrapper: `logger.error(scope, msg, meta)` calls `console.error` and (when authenticated) inserts an `analytics_events` row with `event_type='client_error'` and metadata `{scope, msg, ...meta}`. Throttle to 1 per (scope+msg) per minute via in-memory map to prevent flooding.
- Replace bare `console.error` in `locationService`, `LocationContext`, `useServiceability` with `logger.error`.
- Track usage: emit `analytics_events` rows with `event_type='location_lookup'` from edge function `location/index.ts` (lookup + reverse-geocode actions) — uses existing `record_analytics_event` RPC, no new tables.

### 4. Edge function logging
- `supabase/functions/location/index.ts` — add structured `console.log({ action, status, durationMs, pincode })` per request. Already has try/catch; just standardize the log shape so Supabase log search works.

### 5. Tests
- **Frontend (Vitest):**
  - `src/lib/__tests__/cacheService.test.ts` — get/set/expiry/invalidatePattern (skipping; covered by usage but worth a smoke test).
  - `src/contexts/__tests__/LocationContext.test.tsx` — load saved location from localStorage, fallback chain on auto-detect.
  - `src/hooks/__tests__/useServiceability.test.ts` — returns Map keyed by product_id; disabled when no pincode.
  - `src/contexts/__tests__/CartContext.test.tsx` — `shippingTotal` math, `hasUnserviceableItem` flag, `codAvailable` gating.
- **Backend (Deno):**
  - `supabase/functions/location/location_test.ts` — covers each action (`detect`, `lookup`, `reverse-geocode`, `save`, `list`, `delete`, `default`) with input validation cases (invalid pincode → 400; missing action → 400). Uses `dotenv/load.ts` per project convention.

### 6. No-op on
- **Env vars / secret storage** — already correct (Supabase secrets vault, no hardcoded keys).
- **CDN / edge caching** — Supabase edge functions already run globally; no app code change needed.
- **Scalability** — handled by infra; no action for in-app code.
- **Backend rate limiting** — already documented as known gap (no primitives); skipped per project policy.

## Files

### Create
- `src/lib/logger.ts` — error logger + throttle + analytics insert
- `src/lib/__tests__/cacheService.test.ts`
- `src/contexts/__tests__/LocationContext.test.tsx`
- `src/hooks/__tests__/useServiceability.test.ts`
- `src/contexts/__tests__/CartContext.test.tsx`
- `supabase/functions/location/location_test.ts`

### Edit
- `src/services/locationService.ts` — wrap `lookup` + `reverseGeocode` in `cacheService`; add in-flight dedupe for `detect`; replace `console.error` with `logger.error`
- `src/hooks/useServiceability.ts` — add `retry`/`refetchOnWindowFocus: false` query defaults
- `src/contexts/LocationContext.tsx` — toast once if both GPS and IP fail; use `logger.error`
- `supabase/functions/location/index.ts` — standardized structured logging; emit `location_lookup` analytics event on `lookup` + `reverse-geocode`

## Out of scope
- Backend rate limiting (no primitive available)
- New monitoring dashboard UI (analytics already feeds existing admin pages)
- Replacing React Query with anything custom
- CDN configuration (managed by Lovable Cloud)

