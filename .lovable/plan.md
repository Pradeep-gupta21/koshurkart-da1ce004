

User wants a fully admin-managed dynamic sidebar menu backend. Currently `get-sidebar-menu` returns hardcoded programs + product-derived categories. This plan replaces that with a real CRUD-able `menu_items` table + role-aware tree API + admin management.

Stack mapping: Express → Supabase Edge Functions; MongoDB → Postgres; Redis → in-memory `cacheService` + Cache-Control headers (no Redis in stack).

---

## Dynamic Sidebar Menu — Backend

### 1. Database (`menu_items` table)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| title | text | required |
| icon | text | lucide icon name |
| route | text | nullable (parent groups have none) |
| parent_id | uuid FK → menu_items.id | nullable, ON DELETE CASCADE |
| role_access | app_role[] | empty = public; else any-of match |
| order_index | int | default 0 |
| is_active | bool | default true (soft delete = false) |
| section | text | 'shop' or 'dashboard' — keeps shop drawer & dashboard sidebar separate |
| badge_key | text | nullable, optional live-count key |
| created_at, updated_at | timestamptz | auto |

Indexes: `(section, parent_id, order_index)`, `(is_active)`.

**RLS:**
- SELECT: public, only `is_active = true`
- INSERT/UPDATE/DELETE: `has_role(auth.uid(), 'admin')` only

Seed: migrate current hardcoded items (Today's Deals, New Arrivals, Best Sellers, Trending, plus admin/vendor dashboard nav) so nothing regresses.

### 2. Edge Functions (replace REST verbs)

Single function `menu` routing on method + path — simpler than 4 functions, identical capability.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/menu?section=shop` | public | Returns role-filtered nested tree |
| POST | `/menu` | admin JWT | Create item |
| PUT | `/menu/:id` | admin JWT | Update item |
| DELETE | `/menu/:id` | admin JWT | Soft delete (`is_active = false`) |

All admin mutations validate JWT via `auth.getUser()` + `has_role` RPC. Zod validates payloads (title 1-80, icon ≤40, route ≤200 starts `/`, role_access subset of enum).

### 3. Tree Building & Role Filter

Server-side:
1. Fetch all `is_active` rows for `section`, ordered by `order_index`.
2. Filter: include row if `role_access` is empty (public) OR intersects user's roles (`guest` for unauth).
3. Build tree via single-pass `Map<id, node>` then attach children. Drop orphaned children whose parent was filtered out.
4. Append dynamic `trending` products (kept as today) so admins manage navigation, not auto-generated lists.

### 4. Caching

- **Server**: In-memory `Map` keyed by `section + roles-hash`, TTL 5min. Invalidated on any mutation.
- **HTTP**: `Cache-Control: private, max-age=60` on GET (varies by user role → private).
- **Client**: React Query `staleTime: 5min` (already in place).

No Redis — stack is single-region edge functions; in-memory + HTTP caching is sufficient at current scale and avoids new infra.

### 5. Security

- Admin gate: `auth.getUser()` → `supabase.rpc('has_role', { _user_id, _role: 'admin' })` → 403 on fail.
- Zod validation on every mutation; reject unknown fields (`.strict()`).
- Cycle prevention: on PUT, reject if `parent_id` would create a loop (walk ancestors).
- Soft delete cascades: when deactivating a parent, also deactivate descendants (single recursive CTE update).
- CORS headers on every response.

### 6. Frontend Integration

- Update `src/services/sidebarMenuService.ts` to call new endpoint, return `{ tree, trending }`.
- Update `ShopSidebar` to render server tree instead of hardcoded `programs`/`categories`.
- New admin page `src/pages/admin/AdminMenu.tsx`: tree view with drag-to-reorder (uses existing `@dnd-kit` if present, else simple up/down arrows), inline edit dialog, role-access multi-select, soft-delete toggle. Linked from admin nav.

### Files

**Create**
- `supabase/migrations/<ts>_menu_items.sql` — table, indexes, RLS, seed
- `supabase/functions/menu/index.ts` — CRUD router
- `src/pages/admin/AdminMenu.tsx`
- `src/components/admin/MenuItemForm.tsx`
- `src/components/admin/MenuTreeEditor.tsx`

**Modify**
- `src/services/sidebarMenuService.ts` — point at new endpoint, type tree
- `src/components/navigation/ShopSidebar.tsx` — render server tree
- `supabase/functions/get-sidebar-menu/index.ts` — keep only `trending` (or delete; prefer keep for backwards compat, mark deprecated)
- `src/config/navigation.ts` — leave dashboard nav as fallback; admin can override via `section='dashboard'` rows
- `src/pages/admin/AdminDashboard.tsx` — add "Menu" route entry

### Out of scope
- Drag-to-reorder UX polish beyond basic up/down (can add later)
- Per-locale i18n of menu labels
- A/B testing variants of menu

