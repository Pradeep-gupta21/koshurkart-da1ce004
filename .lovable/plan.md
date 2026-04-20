
## Goal
Extend the existing sidebar backend so it returns location-aware sections and supports admin CRUD with soft-deletes — without rebuilding what already works.

## Reality check

| Spec ask | Status | Notes |
|---|---|---|
| `menu_items` table with role_access, badge_key, parent_id, section, order_index, is_active | ✅ | Already in DB |
| `GET /menu` returns role-filtered nested tree, cached 5min | ✅ | `supabase/functions/menu/index.ts` |
| Admin CRUD UI | ✅ | `AdminMenu.tsx` + `MenuTreeEditor.tsx` writes via Supabase client (RLS-gated to admins) |
| RLS protects writes | ✅ | "Admin manages menu items" policy |
| Input validation on writes | ⚠️ Partial | Client-only via React state; no Zod schema |
| Location detection (GPS/IP) + storage (localStorage + `user_locations`) | ✅ | `LocationContext` + `serviceable_pincodes` |
| **Location → menu**: prioritize Essentials, show "Now delivering to your area" | ❌ | Menu doesn't know about pincode |
| **"Most Ordered Near You"** dynamic | ❌ | Static link to `/search?sort=trending&local=1` |
| Soft-delete (`is_active=false`) | ✅ schema | Editor currently hard-deletes — should flip to soft |

## Plan

### 1. Make `menu` edge function location-aware
Accept optional `?pincode=XXXXXX`. Resolve serviceability via `serviceable_pincodes`:
- If pincode is in **J&K** (state = "Jammu and Kashmir"), bump the **Essentials** section's `order_index` to top and inject a synthetic banner item: *"Now delivering essentials to {city}"* (badge_key: `now-delivering`, returned as a `meta` field, not persisted).
- Replace the *"Most Ordered Near You"* leaf's `route` with `/search?sort=popularity&pincode={pincode}` so the search page filters by serviceable products.
- Cache key includes pincode bucket (first 3 digits) so we don't blow up cache cardinality.

Response shape stays the same (sections + nested tree) plus a new optional `meta: { delivery_banner?: { city, message, badge_key } }`.

### 2. Add `now-delivering` badge to registry
Extend `src/lib/badgeRegistry.ts` with `now-delivering` (saffron with Truck icon, label *"Now delivering to {city}"* — supports `{city}` token replacement at render time).

### 3. Render delivery banner in sidebar
In `ShopSidebar.tsx`, when `meta.delivery_banner` is present, render a thin saffron strip above sections with the message and a small Truck icon. Dismissable per-session via `sessionStorage`.

### 4. Wire pincode into the menu query
`useNavigation.ts` already fetches the menu via React Query. Read pincode from `LocationContext` and pass it to the edge function; include it in the queryKey so cache buckets per-pincode.

### 5. Switch admin delete to soft-delete
`MenuTreeEditor.tsx` currently calls `.delete()`. Change to `.update({ is_active: false })`. Add an "Archived" toggle in the admin view to surface inactive items and a "Restore" action that flips it back. The edge function already filters `is_active=true` so soft-deleted items disappear from the public menu automatically.

### 6. Add server-side validation to admin writes
Two paths:
- **Client**: add `src/lib/validators/menuItemSchema.ts` (Zod) — `title 1–80`, `route` optional URL/path, `icon` ≤ 40, `section` enum, `role_access` array of `app_role`, `order_index` int, `badge_key` ≤ 40. Validate on save in `MenuTreeEditor`.
- **Server**: a tiny new edge function `menu-admin` is overkill since RLS already enforces auth+admin role and the Supabase client write goes through PostgREST with column-level type checks. Skip a custom write endpoint; rely on RLS + Zod + DB types.

### 7. "Most Ordered Near You" — quick wire
Update the seed entry's route to `/search?sort=popularity&pincode={user_pincode}` (token replaced server-side in the menu function based on `?pincode=` query). Search page already supports `sort=popularity`; pincode filter falls back to global if unset. No new ranking algorithm — that's a follow-up.

## Out of scope
- Redis (5-min in-memory cache in the edge function is sufficient at current scale)
- A separate Express backend (Supabase edge functions cover the API contract)
- Geo-distance ranking for "Most Ordered Near You" (ship the link wiring; real algorithm is a separate task)
- Storing the menu in a different shape (current schema already covers all spec fields except `priority` → we use `order_index`, and `badge` → `badge_key`)

## Files

**Edit**
- `supabase/functions/menu/index.ts` — accept `?pincode`, resolve J&K, reorder Essentials, inject delivery_banner meta, token-replace pincode in routes
- `src/lib/badgeRegistry.ts` — add `now-delivering` entry
- `src/components/navigation/ShopSidebar.tsx` — render `meta.delivery_banner` strip with dismiss
- `src/hooks/useNavigation.ts` — read pincode from LocationContext, include in query + queryKey
- `src/components/admin/MenuTreeEditor.tsx` — soft-delete, archived toggle, restore action, Zod validation on save
- `src/pages/admin/AdminMenu.tsx` — pass through archived state if needed

**Create**
- `src/lib/validators/menuItemSchema.ts` — Zod schema for menu item create/update

**Data**
- One INSERT/UPDATE migration to ensure the seeded "Most Ordered Near You" leaf uses the `{pincode}` token in its route
