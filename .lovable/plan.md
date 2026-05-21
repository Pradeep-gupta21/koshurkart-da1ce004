## Remove demo/test login system

The only fake auth surface in the app is the `DevRoleSwitcher` (bug icon, bottom-right). Real auth (`useAuth`, `ProtectedRoute`, `RoleRoute`, `VendorStatusGate`) is already production-grade and stays untouched.

### Changes

1. **Delete** `src/components/dev/DevRoleSwitcher.tsx` — hardcoded `admin@test.com` / `vendor@test.com` / `user@test.com` quick-login buttons + one-click admin promotion field.
2. **Edit** `src/App.tsx` — remove the `DevRoleSwitcher` import and its `<DevRoleSwitcher />` render (line 22 + 131).
3. **Migration** — drop the `public.promote_to_admin(_email text)` SQL function so no client can promote arbitrary emails to admin, even via direct RPC.

### Verified safe / unchanged

- `useAuth.tsx` — no bypass logic, uses real Supabase session.
- `ProtectedRoute`, `RoleRoute`, `VendorStatusGate` — continue to gate `/profile`, `/vendor/*`, `/admin/*`.
- `AuthPage.tsx` — real email/password (+ existing providers) sign-in, kept as the only entry point.
- No other `demo`, `mock`, `bypass`, `test@` references exist in `src/` or `supabase/functions/`.

### Post-change behavior

- No floating dev button in any environment.
- Admin/vendor access only via real accounts with rows in `user_roles` / `vendors`.
- Unauthenticated users hitting `/admin/*` or `/vendor/*` are redirected by existing route guards.