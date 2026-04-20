

Most of this is already wired. Let me audit what's actually missing vs done.

**Already in place:**
- `useAuth` exposes `user, session, loading, roles, isAdmin, isVendor, vendorId` — global session ✓
- `RoleRoute` + `ProtectedRoute` guard admin/vendor routes ✓
- `menu` edge function filters by role server-side ✓
- `useNavigation` filters config by role client-side ✓
- `ShopSidebar` renders backend tree via React Query ✓
- `SidebarSkeleton` for loading ✓
- `SidebarHeader` shows guest vs signed-in ✓

**Real gaps to close:**
1. `sidebarMenuService.fetchSidebarMenu` calls the `menu` edge function **without forwarding the user's JWT** → backend always treats caller as `guest`, so role-restricted menu items (user/vendor/admin) never appear in the shop drawer.
2. React Query cache key for the menu does not include `roles` → after sign-in/out the same cached `guest` tree is reused until staleTime expires.
3. No error UI in `ShopSidebar` — silent failure if the function errors (only `isLoading` is handled).
4. `SidebarHeader` doesn't show role badges (admin/vendor) so user can't tell their access level at a glance.
5. `ShopSidebar` doesn't sign-out cleanly: there's no sign-out button when signed in (only sign-in for guests).
6. Dashboard sidebar (`useNavigation`) is purely client-filtered config — fine, but should also gracefully handle the `loading` auth state (currently flashes guest items for a tick).

---

## Sidebar ↔ Auth Integration

Close the 6 gaps so the sidebar is fully role-aware end-to-end.

### 1. Forward JWT to menu API (critical)
`src/services/sidebarMenuService.ts` — switch from raw `fetch` to `supabase.functions.invoke('menu', { method: 'GET' })` so the user's access token is automatically attached. Backend will then resolve the correct roles instead of defaulting to guest.

### 2. Cache key includes roles
`src/components/navigation/ShopSidebar.tsx` — change React Query key from `['sidebar-menu']` to `['sidebar-menu', section, rolesKey]` where `rolesKey = roles.sort().join(',') || 'guest'`. Auth state changes → instant correct tree, no stale guest data.

### 3. Error state
`ShopSidebar` — render a small `EmptyState` with retry button when `isError`. Falls back to static role-based items from `useNavigation` so the drawer is never empty.

### 4. Role badges in header
`src/components/navigation/SidebarHeader.tsx` — show small `Badge` chips next to the name: "Admin" / "Vendor" when `isAdmin` / `isVendor` is true. Uses existing shadcn Badge.

### 5. Sign-out in sidebar
`ShopSidebar` footer — when `user` exists, show "Sign Out" button calling `signOut()` then `close()`. Already has theme/currency area to slot it in.

### 6. Auth-loading skeleton
`useNavigation` — return `{ sections, loading }` where `loading = auth.loading`. `DashboardSidebar` and `ShopSidebar` show `SidebarSkeleton` while `loading` is true (prevents guest-flash on refresh).

### Files

**Modify**
- `src/services/sidebarMenuService.ts` — use `supabase.functions.invoke`
- `src/components/navigation/ShopSidebar.tsx` — role-keyed cache, error state, sign-out button, loading gate
- `src/components/navigation/SidebarHeader.tsx` — role badges
- `src/hooks/useNavigation.ts` — expose auth `loading`
- `src/components/navigation/DashboardSidebar.tsx` — show skeleton during auth loading

### Out of scope
- New routes / new RLS (existing guards are sufficient)
- Realtime role changes (covered by existing `onAuthStateChange` in `useAuth`)

