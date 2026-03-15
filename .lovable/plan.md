

## Authentication & Role-Based Access — Implementation Plan

Your project **already has** most of the requested functionality built and working. Here is the current state and what needs to be added:

### Already Implemented
- **User signup & login** — `AuthPage.tsx` with email/password via Lovable Cloud Auth
- **Password hashing** — handled automatically by the auth system (bcrypt equivalent)
- **Session handling** — JWT-based sessions managed by `useAuth.tsx`
- **Three roles** — `user`, `vendor`, `admin` stored in `user_roles` table with `app_role` enum
- **Role checking** — `has_role()` security definer function + RLS policies on all tables
- **Vendor onboarding at signup** — vendor record auto-created via `handle_new_user` trigger
- **Vendor dashboard protection** — `VendorDashboard.tsx` checks `isVendor` before rendering
- **Login page, signup page** — both exist as tabs in `AuthPage.tsx`

### What Needs to Be Added

#### 1. Route protection components
Create a `ProtectedRoute` wrapper and a `RoleRoute` wrapper that enforce authentication and role checks at the routing level:
- `ProtectedRoute` — redirects unauthenticated users to `/auth`
- `RoleRoute` — checks `roles` array from `useAuth` and shows "Access Denied" or redirects if the user lacks the required role
- Apply to routes: `/vendor/*` → vendor only, `/admin/*` → admin only, `/profile`, `/checkout`, `/orders` → authenticated

#### 2. Vendor apply page (`/vendor/apply`)
A standalone page for existing users (non-vendors) to apply to become a vendor:
- Form: store name, store description
- On submit: insert into `vendors` table with `verification_status = 'pending'` and add `vendor` role
- Requires a new RLS policy or edge function since `user_roles` INSERT is currently blocked by RLS
- Add a database migration to allow users to insert their own vendor application (or use a security definer function to handle the apply flow)

#### 3. Admin pages
- **Admin Dashboard** (`/admin`) — layout similar to vendor dashboard with sidebar
- **Vendor Approval page** (`/admin/vendors`) — list vendors with `verification_status = 'pending'`, approve/reject buttons
- **Admin overview** — basic stats (total users, vendors, orders, revenue)
- Requires UPDATE RLS policy on `vendors` for admins (already allowed via existing policy using `has_role`)

#### 4. Database changes
- Create a `vendor_apply` security definer function that:
  - Inserts into `vendors` (store_name, store_slug, user_id) with `verification_status = 'pending'`
  - Inserts `vendor` role into `user_roles`
  - This bypasses RLS safely since both tables block direct INSERT for regular users in certain flows

#### 5. Update App.tsx routes
- Wrap `/vendor/*` with `RoleRoute` requiring `vendor`
- Wrap `/admin/*` with `RoleRoute` requiring `admin`
- Wrap `/profile`, `/checkout` with `ProtectedRoute`
- Add `/vendor/apply` as a public authenticated route
- Add `/admin` nested routes (overview, vendors)

### Files to Create/Modify
- **Create:** `src/components/auth/ProtectedRoute.tsx`, `src/components/auth/RoleRoute.tsx`
- **Create:** `src/pages/VendorApplyPage.tsx`
- **Create:** `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/AdminOverview.tsx`, `src/pages/admin/AdminVendors.tsx`
- **Modify:** `src/App.tsx` — add route guards and admin routes
- **Migration:** `vendor_apply()` security definer function

