
## Reality check

This request is largely **already shipped** in your codebase. Here's the honest gap analysis before proposing work:

| Spec ask | Status | Evidence |
|---|---|---|
| **Roles: Guest / User / Vendor / Admin** | ✅ | `app_role` enum, `user_roles` table, `has_role()` SECURITY DEFINER, `useAuth` exposes `roles/isAdmin/isVendor` |
| **Sidebar changes by role** | ✅ | `menu` edge function filters by `role_access[]`; `useNavigation` passes role; `SidebarHeader` shows role badge |
| **Secure APIs (JWT + RBAC)** | ✅ | RLS on every table via `has_role()`; edge functions validate JWT via `auth.getClaims()`; `ProtectedRoute` + `RoleRoute` on `/admin/*`, `/vendor/*` |
| **Frontend↔backend role sync** | ✅ | `useAuth` subscribes to `onAuthStateChange` and refetches `user_roles` |
| **Menu fully backend-driven** | ✅ | `menu_items` table + admin CRUD via `MenuTreeEditor` |
| **API caching** | ✅ | Edge function in-memory cache (5min, pincode-bucketed) + React Query `staleTime` |
| **Code splitting / lazy loading** | ⚠️ Partial | All routes in `App.tsx` are eagerly imported; admin & vendor bundles ship to every guest |
| **API failure fallback + retry** | ⚠️ Partial | React Query default retry on `useNavigation`; no explicit error UI in sidebar; no retry/backoff config |
| **Smooth animations / premium feel** | ✅ | Already polished in last passes |
| **Unit tests** | ✅ exists | `SidebarItem.test.tsx`, `ExpandableMenu.test.tsx`, `CartContext.test.tsx`, `cacheService.test.ts`, `sidebarMenuService.test.ts` |
| **Edge function tests** | ✅ exists | `supabase/functions/menu/menu_test.ts`, `_tests/location_test.ts` |
| **Env configs / secret management** | ✅ | `.env` auto-managed; secrets in Supabase vault (Razorpay, Lovable AI, etc.) |

**Verdict:** The auth + RBAC + backend-driven menu + testing + env story is already production-ready. The two real gaps are **route-level code splitting** and **explicit sidebar error UX with retry**. Everything else would be busywork or duplication.

## Plan — ship the two real gaps, document the rest

### 1. Route-level code splitting (`src/App.tsx`)

Convert all page imports to `React.lazy()` and wrap `<Routes>` in a `<Suspense>` with the existing `PageSkeleton` fallback. Group by role for clean chunk names:

- **Public chunks**: `HomePage`, `SearchPage`, `ProductDetailPage`, `AuthPage`, `CartPage`, `CheckoutPage`, `VendorApplyPage`, `NotFound`
- **User chunk**: `ProfilePage`
- **Vendor chunk** (loaded only when a vendor hits `/vendor/*`): `VendorDashboard` + nested `VendorOverview`, `VendorProducts`, `VendorOrders`, `VendorPayments`, `VendorCampaigns`, `VendorAnalytics`, `VendorNotifications`
- **Admin chunk** (loaded only when an admin hits `/admin/*`): `AdminDashboard` + nested `AdminOverview`, `AdminVendors`, `AdminPayments`, `AdminPayouts`, `AdminReviews`, `AdminCampaigns`, `AdminPlacements`, `AdminPricing`, `AdminMenu`, `AdminSecurity`, `AdminSettings`

Result: a guest's initial JS payload drops the entire admin + vendor surface. Vite emits separate chunks automatically.

Keep the eagerly-needed shells (`DashboardLayout`, `Header`, `Footer`, `ProtectedRoute`, `RoleRoute`) eager so route transitions stay instant.

### 2. Sidebar error fallback + retry (`useNavigation.ts` + `ShopSidebar.tsx`)

- In `useNavigation.ts`, configure React Query with `retry: 2`, `retryDelay: exponential backoff (1s, 2s)`, and surface `error` + `refetch` from the hook.
- In `ShopSidebar.tsx`, when `error` is truthy and not loading, render an inline error state: small alert icon, "Couldn't load menu", and a **Retry** button that calls `refetch()`. Keep `SidebarHeader` and the dismissible delivery banner visible even on error so the panel never feels broken.
- Add a tiny test in `ExpandableMenu.test.tsx` style (`SidebarError.test.tsx`) that asserts the retry button calls a passed handler.

### 3. Confirm-and-document what's already production-ready

No new code for these — just verify in QA pass:
- Auth state hydration (anon → signed-in role flip updates sidebar live via existing `onAuthStateChange`)
- RLS coverage (every table has `has_role()`-gated admin policies; vendor/user policies use ownership joins)
- Edge function JWT validation (`menu`, `location`, `create-razorpay-order`, `verify-razorpay-payment`)
- Menu CRUD respects soft-delete + Zod validation (shipped last loop)

## Out of scope (intentional)

- Rewriting the sidebar in Zustand/Redux — `SidebarContext` + React Query is already the production pattern for this app
- Adding a separate Express backend — Supabase edge functions cover the API contract
- Moving to Next.js — incompatible with the Vite/React stack
- Service worker / offline cache — premature for current scale
- New tests beyond the one retry test — existing coverage is appropriate for the surface area

## Files

**Edit**
- `src/App.tsx` — convert page imports to `React.lazy`, wrap routes in `<Suspense>` with `PageSkeleton`
- `src/hooks/useNavigation.ts` — add `retry`, `retryDelay`, expose `error` + `refetch`
- `src/components/navigation/ShopSidebar.tsx` — render error state with Retry button when menu query fails

**Create**
- `src/components/navigation/SidebarError.tsx` — tiny presentational error block (icon + message + retry button)
- `src/components/navigation/SidebarError.test.tsx` — asserts retry handler is called
