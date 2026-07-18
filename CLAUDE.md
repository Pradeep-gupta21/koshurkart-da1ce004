# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KoshurKart — a Kashmir-focused, multi-vendor e-commerce marketplace (INR-only). One React SPA with three surfaces: customer storefront, vendor dashboard (`/vendor/*`), and admin dashboard (`/admin/*`). Backend is Supabase (Postgres + RLS + Storage + Edge Functions + Realtime) via Lovable Cloud. Originated on Lovable — legacy brand names appear in identifiers (`nexus_`, `marketplace_`, `kk_` localStorage prefixes).

`docs/CODEBASE_ANALYSIS.md` is a detailed architectural walkthrough; `docs/VENDOR_API.md` documents the vendor onboarding API surface.

## Commands

```sh
npm run dev          # Vite dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit -p tsconfig.app.json
npm run test         # Vitest run (jsdom, globals, setup: src/test/setup.ts)
npm run test:watch   # Vitest watch mode

# Single test file
npx vitest run src/services/sidebarMenuService.test.ts
```

Unit tests match `src/**/*.{test,spec}.{ts,tsx}`. Path alias `@/` → `src/` (both Vite and Vitest).

Edge-function tests are Deno tests in `supabase/functions/_tests/` (they load `.env` via std dotenv and hit the live functions URL):

```sh
cd supabase/functions && deno test --allow-net --allow-env --allow-read _tests/location_test.ts
```

Playwright e2e uses `lovable-agent-playwright-config` (`playwright.config.ts`).

Required env vars (see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPPORT_WHATSAPP_NUMBER`.

## Architecture

### Non-negotiable design principles

- **The client never sends prices.** Pricing, stock reservation, order creation, and payment verification are server-authoritative, implemented in Supabase Edge Functions (`create-checkout` is the source of truth; `quote-checkout` for read-only quotes). Checkout is idempotent (stable sessionStorage key + retry).
- **All backend access goes through `src/services/`.** Components and hooks never call `supabase` directly for domain data (auth/session only). Services map snake_case DB rows → camelCase domain types (`src/types/`); `mapDbProduct` is the canonical adapter.
- **Security lives in the database.** All tables have RLS. Role checks use a `SECURITY DEFINER` `has_role()` helper; sensitive data (KYC, bank, financials, admin lists) is exposed only via `SECURITY DEFINER` RPCs (`get_my_vendor`, `get_vendor_financials`, `list_vendors_admin`, …). The client's role list from `useAuth` is convenience only, never the security boundary.
- **New backend features follow the existing seam:** edge function (keys server-side) → service module in `src/services/` → React Query hook.

### Key layers

- `src/App.tsx` — provider tree + router. Order matters: `AuthProvider` sits above `LocationProvider`/`CartProvider`/`WishlistProvider` because they depend on auth state. Guarded routes are lazy-loaded.
- `src/hooks/useAuth.tsx` — auth backbone: session, roles (from `user_roles`), vendor status (via `get_my_vendor` RPC), 30-minute idle timeout. Route guards compose as `ProtectedRoute → RoleRoute("vendor"|"admin") → VendorStatusGate` (`src/components/auth/`).
- `src/services/` — the backend boundary (~19 services). Two caching tiers: hand-rolled `cacheService` (TTL Map) fronts read-heavy calls; React Query manages staleness in hooks.
- `src/ai/` — provider-agnostic AI layer: `agents/` (customer/vendor/admin agents + registry), `providers/` (Gemini + mock behind `AIProvider` interface), `planner/` (task decomposition with cycle detection — has unit tests), `memory/`, `jobs/` (Supabase-backed job store + worker), `tools/`, `knowledge/`, `prompts/`. `AIService` (`src/ai/services/ai.service.ts`) is the single entry point; API keys belong server-side (`ai-chat`, `ai-job-worker` edge functions), never in this layer.
- `src/config/navigation.ts` — data-driven, role-filtered nav (`shopperNav`, `vendorNav`, `adminNav`); can be extended at runtime by the admin-managed `menu_items` table via the `menu`/`get-sidebar-menu` edge functions.
- `src/integrations/supabase/` — generated client + `Database` type. Do not edit.
- `supabase/functions/` — ~25 edge functions; `config.toml` sets `verify_jwt` per function (payment webhooks verify signatures internally). `_shared/` has shared pricing logic and React-Email templates. `supabase/functions/deno.json` maps `@/` to `../../src/`.
- `supabase/migrations/` — 84+ SQL migrations. Some functions/tables are redefined across migrations (e.g. `handle_new_user`; both `payouts` and `payout_requests` exist) — the latest migration wins.

### State management split

Server-state → React Query. UI/session state → React Contexts (`src/contexts/`): cart (localStorage `marketplace_cart`, buy-now in sessionStorage), wishlist (guest localStorage with merge-on-auth into `wishlist_items`), location, theme, sidebar. Currency is INR-only (`currencyService` format/convert are identity no-ops).

### Checkout flow

`CheckoutPage` is a state machine (`form | processing | success | failed | upi_pending | razorpay_pending`). Payment methods: Razorpay, COD (gated by pincode serviceability + per-item `allowCod`), and a direct-vendor UPI override when the whole cart belongs to a single commission-exempt vendor. `useCheckoutQuote` gates "Place Order" on a valid server quote. Stale stock reservations are released by the `sweep_stale_orders` cron.
