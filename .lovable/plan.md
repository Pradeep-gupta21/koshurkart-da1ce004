# Koshur Kart — Production-Readiness Audit & Auto-Fix Plan

Goal: Audit the platform end-to-end across UI, payments, auth, API security, performance, DB, and error handling. Produce a prioritized issue report and apply all safe, non-breaking fixes in the same pass. Risky changes (schema rewrites, payment-state logic, RLS rewrites) are flagged for explicit approval, not silently changed.

## Phase 1 — Discovery (read-only)

Use `acp_subagent--explore` in parallel across the six audit domains so each report comes back with file:line citations.

1. **UI & responsiveness** — sweep `src/pages/**`, `src/components/**`, `src/index.css`, `tailwind.config.ts`.
   - Hardcoded colors (text-white, bg-black, #hex) vs semantic tokens
   - Mobile breakpoints (current viewport 576px) — Header, ProductGrid, CheckoutPage, dashboards
   - Missing loading/empty/error states, layout shift, focus states, a11y (alt, aria, contrast)
   - Image sizing (CLS), lazy loading, `<img>` width/height

2. **Auth flow** — `src/hooks/useAuth.tsx`, `src/pages/AuthPage.tsx`, `src/pages/auth/**`, `ProtectedRoute`, `RoleRoute`, `log-auth-event`, `otp-send`, `otp-verify`.
   - `getSession` vs `getUser` usage on protected paths
   - onAuthStateChange listener order, token refresh
   - Password reset hash handling, OTP rate limiting, leaked-password (HIBP)
   - Role checks always via DB `has_role`, never client-trusted

3. **Dashboard protection** — `src/App.tsx` routes, `VendorStatusGate`, admin pages.
   - Every `/vendor/*` and `/admin/*` wrapped in `ProtectedRoute` + `RoleRoute`
   - No data fetches before role resolves (flash of unauthorized content)

4. **Payments** — `CheckoutPage`, `PaymentSuccess/Failed`, `services/paymentService.ts`, edge functions `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, `create-checkout`, `confirm-upi-payment`, `verify-upi-payment`, `admin-resync-payment`.
   - Server-side amount recomputation (never trust client total)
   - Webhook signature verification + idempotency via `webhook_events`
   - Order/payment status state machine; orphaned `pending` cleanup
   - COD/UPI manual-verify race conditions

5. **API / edge-function security** — every function in `supabase/functions/`.
   - CORS, JWT validation (`auth.getUser()`), Zod input validation
   - `verify_jwt` config matches function intent (webhooks=false, user actions=true)
   - Secrets only via `Deno.env`, no leakage in logs
   - Rate limiting via `auth_rate_limits` where applicable

6. **DB & RLS** — schema already in context.
   - `auth_rate_limits` and `phone_otps` have **RLS enabled but zero policies** → unreachable from client (intended? confirm) and definitely no anon writes
   - `profiles` exposes email/phone to `public` SELECT — **PII leak**
   - Missing indexes on hot paths: `products(vendor_id, status)`, `order_items(order_id)`, `order_items(vendor_id)`, `payments(order_id)`, `analytics_events(product_id, created_at)`, `notifications(user_id, is_read)`
   - N+1 risk in vendor dashboards & product listings
   - `supabase--linter` run for security warnings

7. **Performance** — `browser--performance_profile` on `/`, `/search`, `/product/:slug`, `/vendor`.
   - Bundle size, route-level code splitting, image formats
   - Realtime subscription leaks in `useRealtimeSubscription`
   - Cache TTLs in `services/cacheService.ts`

8. **Error handling** — `ErrorBoundary` coverage, toast vs silent failures, retry logic, Sentry-style logging.

## Phase 2 — Report

Single consolidated report grouped by severity:
- **P0 Critical** (security, data loss, payment correctness)
- **P1 High** (broken flows on mobile, missing auth gates, perf >3s LCP)
- **P2 Medium** (UI inconsistency, missing indexes, a11y)
- **P3 Polish** (copy, spacing, micro-interactions)

Each item: file:line, impact, fix approach, risk tier (safe / needs-approval).

## Phase 3 — Auto-fix (safe tier only)

Will apply without further confirmation:
- Replace hardcoded color classes with semantic tokens
- Add missing `loading`/`width`/`height` to images, alt text, aria labels
- Add responsive classes for sub-640px on broken layouts
- Add `ErrorBoundary` around route trees that lack it
- Add missing DB indexes (CREATE INDEX IF NOT EXISTS, non-breaking)
- Add Zod validation to edge functions missing it
- Add CORS headers to any edge function missing them
- Tighten `profiles` RLS to hide email/phone from anon (keep name/avatar public) — **flag as semi-risky, will ask before running**
- Fix realtime subscription cleanup leaks
- Add route-level `React.lazy` splitting for vendor/admin bundles
- Add proper loading skeletons where spinners are used
- Wrap unguarded `/vendor/*` `/admin/*` routes in `ProtectedRoute` + `RoleRoute` if any are missing

## Phase 4 — Will NOT auto-apply (require explicit approval)

- Payment state-machine changes
- RLS policy rewrites beyond the profiles PII fix
- Removing/renaming columns or tables
- Auth provider config changes (enabling/disabling providers, HIBP)
- Anything that changes pricing, commission, or earnings math
- Large refactors of `useAuth`, `CartContext`, or checkout

For each item in Phase 4 I'll surface a focused mini-plan after the audit so you can approve them individually.

## Deliverable

1. Markdown audit report posted in chat (P0→P3, with citations)
2. Diff summary of all safe fixes applied
3. Numbered list of approval-required follow-ups with one-line rationale each

Scope guardrail: no business logic, schema, or payment behavior changes without your explicit yes.
