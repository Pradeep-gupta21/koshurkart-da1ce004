## Production authentication system for Koshur Kart

Build on what's already there (Supabase session, `useAuth`, `ProtectedRoute`, `RoleRoute`, `VendorStatusGate`, `profiles` + `user_roles` tables, rate limiter, Zod validation). Fill the gaps: dedicated auth routes, password recovery, phone OTP, Google sign-in, global logout, and correct branding.

### New / refactored pages

```text
/auth                  → Login + Signup (email/password)  +  Google  +  Phone OTP tab
/auth/forgot-password  → email → resetPasswordForEmail({ redirectTo: /auth/reset-password })
/auth/reset-password   → detects recovery session → updateUser({ password })
```

Phone OTP lives inside `/auth` as a third tab: enter phone → `signInWithOtp({ phone })` → 6-digit code input → `verifyOtp({ phone, token, type: 'sms' })`. No extra route needed.

All pages share one `<AuthShell>` (brand mark, card, tabs) so look stays consistent. Rebrand the leftover **"Nexus Market"** copy to **Koshur Kart**.

### `useAuth` additions

- `signOut(scope?: 'local' | 'global')` — default `global` so "logout everywhere" revokes refresh tokens across all devices.
- Keep existing `onAuthStateChange` → `getSession` order (session persistence already works via Supabase's localStorage + auto-refresh).

### Route guards (already implemented — verified, no change)

- `ProtectedRoute` — redirects unauthenticated users to `/auth`.
- `RoleRoute requiredRole="vendor" | "admin"` — checks `roles` from `user_roles` table.
- `VendorStatusGate` — gates vendor dashboard on `verification_status` / `kyc_status`.
- Add `/auth/forgot-password` and `/auth/reset-password` as **public** routes (not behind `ProtectedRoute`).

### Header changes

- Account dropdown: when signed in show "Sign out" → `signOut('global')`; when signed out, "Sign in" links to `/auth`. Already partially done; just wire the sign-out item.

### Backend / Cloud auth config

- Enable providers: **email/password** + **Google** (managed via `configure_social_auth`).
- Keep `auto_confirm_email = false` (verify email before login — production behavior).
- Enable **HIBP leaked-password check** (`password_hibp_enabled: true`).
- Phone OTP requires an SMS provider in Cloud → Auth settings. If not configured yet, the UI shows a friendly error and the user can use email/Google. (No code changes needed once provider is configured.)

### Security recap (already in place, preserved)

- Passwords hashed by Supabase (bcrypt).
- JWT-based sessions with auto refresh in `supabase-js`.
- Rate limiting on login attempts (`RATE_LIMIT_RULES.loginAttempts`).
- Zod validation + `sanitizeEmail` / `sanitizeText`.
- Roles stored only in `user_roles` (never on `profiles`), checked via `has_role()` SECURITY DEFINER — no privilege-escalation surface.

### Files touched

- **edit** `src/pages/AuthPage.tsx` — 3 tabs (Email, Phone, Google button on top), "Forgot password?" link, brand rename, role-aware post-login redirect kept.
- **new** `src/pages/auth/ForgotPasswordPage.tsx`
- **new** `src/pages/auth/ResetPasswordPage.tsx`
- **new** `src/components/auth/AuthShell.tsx` (shared card layout)
- **edit** `src/hooks/useAuth.tsx` — `signOut(scope)` default global.
- **edit** `src/components/layout/Header.tsx` — wire Sign-out menu item.
- **edit** `src/App.tsx` — add `/auth/forgot-password` and `/auth/reset-password` public routes.
- **config** call `configure_social_auth(['google'])` and `configure_auth({ password_hibp_enabled: true, auto_confirm_email: false, disable_signup: false, external_anonymous_users_enabled: false })`.

### Out of scope

- No DB schema changes (profiles / user_roles / vendors already model everything needed).
- No new edge functions.
- No custom auth-email templates (default Lovable templates are fine; can be customized later if user asks).