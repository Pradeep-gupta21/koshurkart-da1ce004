

Most of this is already done across the prior 4 iterations. Let me audit what's actually still missing vs spec.

**Already shipped:**
- DB-driven menu (`menu_items` table + `/menu` edge function) ✓
- React Query caching with role-keyed key, `staleTime: 5min` ✓
- Lazy fetch (only when sidebar opens via `enabled: isOpen`) ✓
- Skeleton loader, error EmptyState with retry ✓
- Smooth animations (Radix Sheet slide-in, Collapsible expand) ✓
- Role filtering server + client ✓
- Admin CRUD UI at `/admin/menu` ✓
- Clean folder structure (`components/navigation/`, `services/`, `contexts/`) ✓

**Real remaining gaps:**
1. **No code splitting on admin page** — `AdminMenu` is eagerly imported in `App.tsx`, bloating main bundle. Same for several other admin/vendor pages but `AdminMenu` is the relevant one here.
2. **No retry/backoff on the menu query** — React Query default retries 3x but with no exponential backoff config, and no timeout. Function failure → 3 instant retries → fail. Need explicit `retry: 2, retryDelay: exponential`.
3. **No tests** — zero tests for `sidebarMenuService`, `SidebarItem`, `ExpandableMenu`, or the `menu` edge function. Vitest already configured (`vitest.config.ts`, `src/test/setup.ts` exist).
4. **Premium UX polish** — current sidebar renders all items flat in sections. Quick wins: subtle dividers, better spacing rhythm, hover micro-interactions, icon color accents on active. Not cluttered means: limit Trending to 4 (not 6), collapse Categories by default, denser type scale.
5. **Env config** — `sidebarMenuService` reads `import.meta.env.VITE_SUPABASE_URL` directly. Already centralized via `client.ts`. Minor: extract menu cache TTL to a constant in service.

Skipping #6 "deployment ready" beyond what's listed — folder structure already clean, env already via Vite.

---

## Production Hardening — Sidebar

Close the 4 real gaps. No re-architecture; surgical changes only.

### 1. Code splitting (perf)

`src/App.tsx` — convert `AdminMenu` (and the other admin/vendor pages already imported eagerly) to `React.lazy()` + wrap routes in `<Suspense fallback={<PageSkeleton />}>`. Cuts ~40-60KB off initial bundle. The shop sidebar itself stays eager (it's on every page).

### 2. Robust retry (error handling)

`src/components/navigation/ShopSidebar.tsx` — add to `useQuery`:
```ts
retry: 2,
retryDelay: (i) => Math.min(1000 * 2 ** i, 8000),
staleTime: 5 * 60_000,
gcTime: 10 * 60_000,
refetchOnWindowFocus: false,
```
Manual retry button in error state already present — keep.

### 3. Tests (Vitest already set up)

**Unit tests (frontend):**
- `src/components/navigation/SidebarItem.test.tsx` — renders title, sets `aria-current="page"` on active route, fires `onSelect` on click
- `src/components/navigation/ExpandableMenu.test.tsx` — toggles `aria-expanded`, renders children when open, hides when closed
- `src/services/sidebarMenuService.test.ts` — mocks `fetch` + supabase client, verifies tree-building from flat rows, role filtering, error throw on 4xx

**Edge function test:**
- `supabase/functions/menu/menu_test.ts` — Deno test for tree-building helper (extract pure function), Zod payload validation rejects bad input, cycle detection rejects parent==self

### 4. UX polish (premium feel)

`src/components/navigation/ShopSidebar.tsx` + children:
- Trending: cap at 4 items (was 6), tighter card with overlay price chip
- Categories: default collapsed, parent shows count badge `(12)` when has children
- Add `<Separator />` between sections instead of relying on padding
- Increase row height to `h-11`, icon-text gap `gap-3`, active item: `bg-accent/40` + 2px left primary border, hover: `bg-accent/20` with `transition-colors duration-150`
- Footer: stack sign-out + theme toggle in a single `border-t` block

### Files

**Create**
- `src/components/navigation/SidebarItem.test.tsx`
- `src/components/navigation/ExpandableMenu.test.tsx`
- `src/services/sidebarMenuService.test.ts`
- `supabase/functions/menu/menu_test.ts`
- `src/components/ui/PageSkeleton.tsx` (lazy fallback)

**Modify**
- `src/App.tsx` — lazy-load admin/vendor pages, add Suspense
- `src/components/navigation/ShopSidebar.tsx` — query retry config, UX polish (separators, spacing, trending cap)
- `src/components/navigation/SidebarItem.tsx` — refined active/hover styles
- `src/components/navigation/ExpandableMenu.tsx` — child count badge, default collapsed
- `supabase/functions/menu/index.ts` — extract `buildTree` to exported pure function for testability

### Out of scope
- Replacing React Query with another lib
- Adding Storybook (overkill at current scale)
- E2E tests (Playwright fixture exists but not wired; out of scope for this pass)

