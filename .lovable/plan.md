

## Reality check

Most of what you described **already exists** in this project from prior turns. Let me map your spec to what's built, and only plan the gaps.

### What already exists ✅

| Your spec | Status | Where |
|---|---|---|
| Top navbar pill "Delivering to [City PIN]" | ✅ | `LocationPill.tsx` in `Header.tsx` |
| Modal on click | ✅ | `LocationDialog.tsx` |
| Auto-detect (GPS + IP fallback) | ✅ | `LocationContext.detect()` → GPS first, IP via `ipapi.co` fallback |
| PIN code input | ✅ | `LocationDialog` pincode tab |
| Loader / error / persist | ✅ | `isDetecting`, toasts, `localStorage` key `lovable.location.v1` |
| Global state | ✅ | `LocationContext` (React Context, not Zustand — same pattern) |
| Sync with backend | ✅ | `user_locations` table + `locationService` |
| `POST /detect` (IP) | ✅ | Inside `LocationContext` (client-side ipapi.co call) |
| `POST /validate` (pin → serviceability) | ✅ | Edge function `supabase/functions/location/index.ts` + `check_serviceability` RPC |
| `POST /set` (save user location) | ✅ | `locationService.addUserLocation` |
| `serviceable_pincodes` table | ✅ | With `delivery_days`, `cod`, `surcharge_pct` |
| `user_locations` table | ✅ | RLS-protected, default-flag enforced via trigger |
| Saved addresses on Profile | ✅ | `SavedAddresses.tsx` (just shipped) |

### What's actually missing ❌

1. **City input** — currently only pincode is supported in the dialog
2. **Autocomplete suggestions** — no `GET /suggestions?q=` endpoint
3. **Mobile bottom-sheet** — `LocationDialog` uses centered Dialog on all sizes (not a Sheet on mobile)
4. **Move IP detection server-side** — currently called from client (`ipapi.co` direct fetch); your spec wants `POST /api/location/detect` on backend

That's it. Everything else is done.

## Plan — fill the 4 gaps

### 1. Suggestions endpoint
Extend `supabase/functions/location/index.ts` with a `GET ?q=...` action that queries `serviceable_pincodes` for matching pincode prefix OR city name (ILIKE). Return up to 8 results: `[{ pincode, city, state }]`.

### 2. IP-detect endpoint (move server-side)
Add `POST { action: "detect-ip" }` to the same edge function. Reads `req.headers.get("x-forwarded-for")`, calls `ipapi.co/{ip}/json/` server-side, returns normalized `{ pincode, city, state, country, lat, lng }`. Falls back to client-IP-less `ipapi.co/json/` if header missing. Update `LocationContext.detect()` to call this instead of hitting ipapi.co directly (avoids CORS/rate-limit on client, centralizes the dependency).

### 3. Autocomplete in LocationDialog
- Add a single combined search input at the top of the dialog: "Enter PIN or city"
- Debounced (250ms) call to `/location?q=...`
- Render a dropdown list of suggestions with city + pincode + state
- Click a suggestion → calls existing `setByPincode` flow → closes dialog
- Keep the existing GPS button and the manual pincode tab as fallbacks
- Keyboard nav: ↑/↓ to move, Enter to select, Esc to close (handled via `cmdk`/`Command` component already in project)

### 4. Responsive: bottom sheet on mobile
Wrap `LocationDialog` content in a conditional: use `Sheet` (side="bottom") when `useIsMobile()` is true, `Dialog` otherwise. Both shadcn primitives are already installed. Same internal content component, two shells.

### Files

**Edit:**
- `supabase/functions/location/index.ts` — add `GET ?q=` and `POST {action:"detect-ip"}` branches
- `src/services/locationService.ts` — add `getSuggestions(q)` and `detectByIp()` wrappers
- `src/contexts/LocationContext.tsx` — swap client `ipapi.co` call for `locationService.detectByIp()`
- `src/components/location/LocationDialog.tsx` — add autocomplete input + mobile Sheet variant

**No DB migration needed** — `serviceable_pincodes` already has city/state.

**No new secrets** — ipapi.co is keyless.

### Out of scope (per existing memory + your screenshot)
- Google Maps API: existing IP-based flow is sufficient and free; spec mentions "Google Maps API / IP" as alternatives — we already use IP
- Replacing React Context with Zustand: spec says "Zustand / Redux Toolkit" — Context already provides global state with the same surface; rewriting is churn for zero benefit
- Editing existing saved address pincodes: covered by delete + re-add (already noted in prior plan)

