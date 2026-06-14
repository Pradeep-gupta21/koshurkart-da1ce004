# Production Auth Redirect Fix

## Goal
All email-based auth flows (signup confirmation, resend verification, password reset, magic link, OAuth) must redirect to the production domain `https://koshurkart.shop`, land on a branded verification handler at `/auth/callback`, then route the user into the app. No Lovable/preview URLs anywhere in the auth flow.

## Changes

### 1. Centralize the production URL
Create `src/lib/authConfig.ts`:
- `export const PRODUCTION_URL = "https://koshurkart.shop"`
- `export const AUTH_CALLBACK_URL = "https://koshurkart.shop/auth/callback"`
- `export const PASSWORD_RESET_URL = "https://koshurkart.shop/auth/reset-password"`

Always use these constants instead of `window.location.origin`, so preview/dev environments never leak into emails.

### 2. Update auth call sites
Replace `window.location.origin`-based redirects with the constants above:
- `src/pages/AuthPage.tsx`
  - `signUp` → `emailRedirectTo: AUTH_CALLBACK_URL`
  - `resend` (verification) → `emailRedirectTo: AUTH_CALLBACK_URL`
  - Google OAuth `redirect_uri: AUTH_CALLBACK_URL`
- `src/pages/auth/ForgotPasswordPage.tsx`
  - `resetPasswordForEmail` → `redirectTo: PASSWORD_RESET_URL`

### 3. New `/auth/callback` page (branded verification handler)
Create `src/pages/auth/AuthCallbackPage.tsx`:
- Handles Supabase verification redirect (both `?code=` PKCE and legacy `#access_token` hash flows).
- Calls `supabase.auth.exchangeCodeForSession(code)` when a `code` param is present; falls back to detecting the existing session for hash-based magic links.
- States: `verifying`, `success`, `error` — all using existing `AuthShell` + Koshur Kart branding (no Lovable references, no dev URLs).
- On `success`:
  - Shows "Email verified" success card with brand styling.
  - After ~2s (and via a "Continue" button), redirects authenticated users via the existing `routeAfterLogin` logic (admin → `/admin`, vendor → `/vendor`, else `/`); if no session, redirects to `/auth`.
- On `error`: shows a branded error state with "Back to sign in" link.

Register the route in `src/App.tsx`:
- `<Route path="/auth/callback" element={<AuthCallbackPage />} />` (lazy import alongside the other auth pages).

### 4. Email templates — strip dev URLs
`supabase/functions/_shared/email-templates/signup.tsx` and `invite.tsx`:
- The runtime `siteUrl` value already comes from the production `ROOT_DOMAIN` (`notify.koshurkart.shop`) — but the templates render that as a clickable brand link. Change the `<Link href={siteUrl}>` to point at `https://koshurkart.shop` (the public site) via a new `siteUrl` value passed from the hook.
- `supabase/functions/auth-email-hook/index.ts`: change `siteUrl` in `templateProps` from `https://${ROOT_DOMAIN}` to `https://koshurkart.shop`. Leave the `SAMPLE_PROJECT_URL` (preview-only, used solely by the local preview endpoint) untouched — it never appears in real emails — but add a code comment clarifying that.

After editing, redeploy `auth-email-hook`.

### 5. Audit pass — confirm no Lovable strings remain in auth surface
Re-run `rg` for `lovable|lovableproject|window.location.origin` across `src/pages/auth`, `src/pages/AuthPage.tsx`, `src/components/auth`, and `supabase/functions/auth-email-hook` + email templates. Anything user-facing must be Koshur Kart branded; remaining matches should only be the internal `@/integrations/lovable` OAuth SDK import (kept — it's the Google sign-in client, not user-visible) and the documented `SAMPLE_PROJECT_URL` preview constant.

### 6. Supabase Auth Site URL / allowed redirects
The Supabase project's **Site URL** and **Additional Redirect URLs** must include `https://koshurkart.shop` and `https://koshurkart.shop/auth/callback` / `https://koshurkart.shop/auth/reset-password`, otherwise Supabase will reject the `emailRedirectTo` and fall back to its configured Site URL (often the Lovable preview). This is configured in Cloud → Users → URL Configuration — I'll surface this with a "View Backend" action and a one-line instruction since it can't be set from code.

## Out of scope (per request)
- No changes to user roles, DB schema, RLS, or core auth logic.
- No changes to OTP/phone flow beyond what's listed.
- Email template branding is already Koshur Kart — only the embedded link target changes.

## Files touched
- New: `src/lib/authConfig.ts`, `src/pages/auth/AuthCallbackPage.tsx`
- Edited: `src/pages/AuthPage.tsx`, `src/pages/auth/ForgotPasswordPage.tsx`, `src/App.tsx`, `supabase/functions/auth-email-hook/index.ts`, `supabase/functions/_shared/email-templates/signup.tsx`, `supabase/functions/_shared/email-templates/invite.tsx`
- Deploy: `auth-email-hook`
