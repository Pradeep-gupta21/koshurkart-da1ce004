

## Testing Guide & Role-Based Redirect — Implementation Plan

### How Your System Currently Works

**Roles** are stored in the `user_roles` table with an `app_role` enum (`user`, `vendor`, `admin`). Every signup automatically gets the `user` role via the `handle_new_user` trigger. Vendor signups also get the `vendor` role. There is no UI-based way to create an admin — it must be done via a database insert.

**Route protection** is already in place:
- `/admin/*` — guarded by `RoleRoute requiredRole="admin"`
- `/vendor/*` — guarded by `RoleRoute requiredRole="vendor"`
- `/checkout`, `/profile` — guarded by `ProtectedRoute` (any authenticated user)

**What's missing:**
1. **Role-based redirect after login** — currently everyone goes to `/` after login
2. **Dev role-switcher** — no quick way to test different roles without re-logging
3. **Admin account creation** — no way to make an admin through the UI

### Plan

#### 1. Role-Based Redirect After Login (`AuthPage.tsx`)
After successful login, fetch the user's roles and redirect:
- Admin → `/admin`
- Vendor → `/vendor`
- User → `/`

#### 2. Create Admin Account (Database Migration)
Create a security-definer function `assign_admin_role(email)` that an existing admin can call, or that can be invoked once to bootstrap the first admin. For the initial bootstrap, we'll use a migration to insert the admin role for a specific user after they sign up.

**Practical approach**: Create an edge function or DB function that can be called once to promote a user to admin by email. This avoids hardcoding user IDs in migrations.

#### 3. Dev Role-Switcher Component
Create a floating dev toolbar (only shown when `import.meta.env.DEV` is true) that displays current roles and provides quick-login buttons for test accounts. This won't fake roles — it will actually sign in as different test users.

#### 4. Step-by-Step Testing Guide
Document in-app or provide clear instructions for the testing workflow.

### Account Setup Instructions (to include in response)

| Account | How to Create | Role Assignment |
|---------|--------------|-----------------|
| **User** | Sign up at `/auth` (no vendor checkbox) | Automatic — `user` role via trigger |
| **Vendor** | Sign up at `/auth` with "I want to sell" checked | Automatic — `user` + `vendor` roles via trigger |
| **Admin** | Sign up normally, then promote via DB function | Manual — call `promote_to_admin(email)` |

### Route Reference
- User: `/`, `/search`, `/product/:slug`, `/cart`, `/checkout`, `/profile`
- Vendor: `/vendor`, `/vendor/products`, `/vendor/orders`, `/vendor/campaigns`, `/vendor/analytics`, `/vendor/payments`
- Admin: `/admin`, `/admin/vendors`, `/admin/campaigns`, `/admin/placements`, `/admin/payouts`, `/admin/reviews`

### Files to Create/Modify
- **Migration**: Create `promote_to_admin` security-definer function
- **Modify**: `src/pages/AuthPage.tsx` — role-based redirect after login
- **Create**: `src/components/dev/DevRoleSwitcher.tsx` — floating dev toolbar with quick-login
- **Modify**: `src/App.tsx` — include DevRoleSwitcher in dev mode

### Testing Workflow Summary
1. Enable auto-confirm emails (for testing convenience)
2. Create 3 accounts: user@test.com, vendor@test.com, admin@test.com
3. Promote admin@test.com using the DB function
4. Use the dev switcher to rapidly toggle between accounts
5. Test: User browses/purchases → Vendor adds products/views orders → Admin approves vendors/campaigns

