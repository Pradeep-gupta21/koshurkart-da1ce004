# Production-Readiness Hardening Plan

This plan has two tracks, executed in order. Track A hardens authentication. Track B is a full audit with automated safe fixes. Risky changes (anything that could log users out, break payments, or change billing) are flagged and will be confirmed before execution.

---

## Track A — Industrial-grade Authentication

### A1. Session & token security
- Switch the Supabase client from `localStorage` to a custom storage adapter that prefers `sessionStorage` for "this device only" sign-ins and keeps `localStorage` only when user ticks "Remember me". This reduces XSS token theft exposure.
- Enable PKCE flow explicitly (`flowType: 'pkce'`) and `detectSessionInUrl: true` for OAuth/reset flows.
- Add a global `onAuthStateChange` listener that:
  - Clears all in-memory caches on `SIGNED_OUT`.
  - Forces `supabase.auth.getUser()` re-validation on `TOKEN_REFRESHED` for protected routes.
- Add idle session expiration (configurable, default 30 min idle → force re-auth) implemented client-side via activity listener + `signOut()`.

Note on cookies: Supabase JS in a SPA does not use HTTP-only cookies for the auth token — tokens live in JS-accessible storage by design. True HTTP-only cookie auth would require an SSR/BFF layer we don't have. I'll document this trade-off and harden what we actually use (storage scope, idle timeout, refresh validation, CSP) instead of pretending we have cookie-based sessions.

### A2. Brute-force & rate limiting
- Extend existing `src/lib/rateLimiter.ts` (already has `loginAttempts`, `otpSend`, `otpVerify`) and wire it into:
  - `AuthPage` login + signup submit
  - `ForgotPasswordPage`
  - `ResetPasswordPage`
- Add server-side throttling in the OTP edge functions (`otp-send`, `otp-verify`) using a new `auth_rate_limits` table keyed by `(identifier, action)` with a sliding window — survives page reload, unlike the in-memory client limiter.
- Lock account temporarily after N failed logins for the same email (soft lock, surfaced as "Too many attempts, try again in Xm").

### A3. Input validation & XSS
- Tighten `src/lib/validators/userSchema.ts`: enforce min 8 chars, complexity (upper/lower/number), reject leaked passwords via Supabase HIBP check.
- Enable Supabase `password_hibp_enabled: true` via `configure_auth`.
- Run all auth form inputs through `sanitizeText` / `sanitizeEmail` before submit.
- Add a strict Content-Security-Policy `<meta>` in `index.html` (script-src self + Razorpay, connect-src self + Supabase + Razorpay, frame-src Razorpay, object-src none, base-uri self). XSS defense-in-depth.
- Audit any `dangerouslySetInnerHTML` usage and replace with sanitized renders.

### A4. CSRF
- Supabase REST uses bearer tokens in `Authorization` header (not cookies) → not classically CSRF-exploitable. Will document this.
- For the only state-changing endpoints that *do* accept cross-origin POST (`razorpay-webhook`, `confirm-upi-payment`, etc.), confirm they validate provider signatures (Razorpay HMAC) or require authenticated JWT — no extra CSRF token needed, but I'll add an Origin/Referer allow-list check on the non-webhook user-initiated edge functions.

### A5. Auth logs & device/session management
- New table `auth_events(user_id, event_type, ip, user_agent, device_fingerprint, created_at, metadata)` populated by:
  - Login success/failure
  - Signup
  - Password reset request/complete
  - OTP send/verify
  - Sign-out
- New table `user_sessions(user_id, session_id, device_label, ip, user_agent, last_seen_at, revoked_at)` updated on login + on app focus.
- New page `/account/security` showing:
  - Recent auth activity (last 20 events)
  - Active sessions with "Sign out" per session and "Sign out everywhere" button (calls `supabase.auth.signOut({ scope: 'global' })`).
- RLS: users read only their own `auth_events` and `user_sessions`; admins read all.

### A6. Secrets & env hygiene
- Audit `.env`: `RAZORPAY_KEY_SECRET` is currently committed there. **Critical**. Plan:
  - Move `RAZORPAY_KEY_SECRET` to Lovable Cloud secrets (already used by edge functions via `Deno.env.get`).
  - Remove from `.env`, leave only `VITE_*` publishable values.
  - Recommend (does NOT auto-rotate) that the user rotate the Razorpay secret in Razorpay dashboard since it was in the repo.

### A7. Loading states & error handling
- Standardize an `<AuthButton>` with built-in spinner + disabled state for all auth forms.
- Wrap auth pages in `<ErrorBoundary>` (already exists) and surface friendly error messages via `useToast` instead of raw Supabase errors.

---

## Track B — Production-Readiness Audit (safe-fix only)

For each area below: scan → list findings → auto-apply only LOW-RISK fixes. MEDIUM/HIGH risk findings get listed for explicit user approval.

### B1. UI consistency & responsiveness
- Sweep all pages at 360 / 768 / 1024 / 1440 viewports. Auto-fix: missing `overflow-x` clipping, fixed widths, untruncated long text, missing focus rings, color tokens used directly instead of semantic ones.
- Verify dark mode parity on all dashboards.

### B2. Payment flow
- Verify Razorpay create → verify → webhook chain end-to-end via `supabase--curl_edge_functions`.
- Verify UPI manual flow and COD path.
- Check idempotency keys on `orders` and replay protection on `webhook_events`.
- Safe fix: add missing client-side disabled state on "Pay" button during processing; add explicit network-error retry UI in `RetryPaymentPanel`.
- Risky (will ask): any change to commission/earnings triggers.

### B3. Auth flow & dashboard protection
- Verify every `/admin/*` and `/vendor/*` route is wrapped in `ProtectedRoute` + `RoleRoute`. Auto-fix any unguarded route found.
- Verify `VendorStatusGate` blocks unverified vendors from sensitive pages.

### B4. API & DB security
- Run `supabase--linter` and `security--run_security_scan`.
- Re-verify the vendors column-grant fix from prior turn is still effective (run the regression test suite already in `_tests/vendor_security_test.ts`).
- Sweep all RLS policies for `USING (true)` on tables with sensitive columns. The `profiles` table currently has `Anyone can view profiles` — phone + email are exposed publicly. **Will flag** and propose tightening to authenticated-only + restricted columns.
- Check every edge function validates JWT via `auth.getUser()` (per project memory) and rejects on failure.

### B5. Performance
- Bundle analysis: identify any large eager imports on the home route; convert vendor/admin dashboards to `React.lazy` if not already.
- Add `loading="lazy"` + `decoding="async"` to product images.
- Verify `cacheService` TTLs are hit for home/product/search.
- Add `<link rel="preconnect">` for Supabase + Razorpay in `index.html`.

### B6. Database query review
- Run `supabase--read_query` to check for N+1 patterns in product listing, vendor analytics, and order pages.
- Verify indexes exist on: `products(vendor_id, status)`, `orders(user_id, created_at)`, `order_items(order_id, vendor_id)`, `payments(order_id)`, `analytics_events(product_id, created_at)`, `auth_events(user_id, created_at)`. Add missing ones via migration.

### B7. Error handling
- Ensure every `await` in services has try/catch + logger call.
- Verify `ErrorBoundary` wraps the route tree (App.tsx).
- Standardize toast error copy.

---

## Deliverables

1. Migrations: `auth_events`, `user_sessions`, `auth_rate_limits`, indexes, profile RLS tightening (pending approval).
2. New page: `/account/security`.
3. Updated: `client.ts` storage adapter, `AuthPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `otp-send`, `otp-verify` edge functions, `userSchema`, `index.html` (CSP + preconnect).
4. `.env` cleanup + secret migration request.
5. Audit report (in chat) listing: auto-fixed items, items needing user approval, items deferred with reason.

---

## What I need to confirm before starting

1. **Profiles table** currently lets anyone (including anon) read `email` + `phone`. Tightening this is the single highest-impact security fix but may affect any public UI that shows seller/reviewer names — OK to lock down to authenticated + non-PII columns only for anon?
2. **Idle session timeout** — default 30 min OK, or different?
3. **Razorpay secret rotation** — I'll move it out of `.env`; will you rotate it in the Razorpay dashboard afterwards?
4. **Scope of "auto-fix safe issues"** — confirm I should proceed without asking per-fix for: missing loading states, missing lazy-loading on images, missing indexes, unguarded routes, CSP/preconnect, validator tightening. Anything risky (RLS changes, payment logic, data migrations) I'll bring back for approval.
