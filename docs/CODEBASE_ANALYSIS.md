# KoshurKart — Codebase Analysis

> A complete architectural walkthrough of the KoshurKart marketplace. This document is
> **analysis only** — no application code was modified in producing it.

---

## 1. Overview

**KoshurKart** is a Kashmir-focused, multi-vendor e-commerce marketplace (INR-only). It has
three distinct surfaces built into a single React SPA:

1. **Customer storefront** — browse, search, product detail, cart, wishlist, checkout, profile.
2. **Vendor dashboard** — store management, products, orders, returns, ads, analytics, payouts.
3. **Admin dashboard** — vendor approval/KYC, payments, payouts, reviews moderation, pricing, ads, security, platform settings.

### Tech stack

| Layer | Technology |
|---|---|
| Build / bundler | Vite 5 + `@vitejs/plugin-react-swc` |
| Language | TypeScript 5 |
| UI framework | React 18 |
| Routing | `react-router-dom` v6 |
| Server-state | TanStack React Query v5 |
| UI kit | shadcn/ui (Radix primitives) + Tailwind CSS |
| Validation | Zod |
| Backend | Supabase (Postgres + RLS + Storage + Edge Functions + Realtime) |
| Payments | Razorpay + UPI (QR / direct-vendor) + Cash on Delivery |
| Charts | Recharts |
| Toasts | `sonner` + shadcn toaster |
| Tests | Vitest + Testing Library; Playwright (e2e); Deno tests for edge functions |
| Platform | Lovable (`.lovable/`, `lovable-tagger`); deployed on Vercel (`vercel.json`) |

The project originated on **Lovable** and has been renamed over time — you'll see legacy
brand names in identifiers (`nexus_`, `marketplace_`, `koshur_kart_`, `kk_` localStorage
prefixes, "Sell on Nexus" nav label).

---

## 2. Folder Structure

```
/
├── docs/                      # Documentation (this file + VENDOR_API.md)
├── public/                    # Static assets
├── src/
│   ├── assets/                # Images incl. hero art, logo asset JSON
│   ├── components/            # All React components (grouped by domain)
│   │   ├── admin/             # Admin sidebar-menu editors
│   │   ├── analytics/         # Shared analytics controls (time-range picker)
│   │   ├── auth/              # Route guards + auth shell
│   │   ├── checkout/          # Checkout helpers (pricing debug box)
│   │   ├── forms/             # Reusable entity forms (product, campaign, checkout)
│   │   ├── home/              # Homepage sections
│   │   ├── layout/            # Header, Footer, DashboardLayout
│   │   ├── location/          # Delivery location & serviceability UI
│   │   ├── navigation/        # Data-driven sidebar system
│   │   ├── notifications/     # Notification bell (realtime)
│   │   ├── orders/            # Return-request modal
│   │   ├── payments/          # Payment status/retry UI
│   │   ├── product/           # Product cards, badges, price, rating, wishlist
│   │   ├── reviews/           # Review section, form, cards, media gallery
│   │   ├── search/            # Search bar
│   │   ├── support/           # WhatsApp floating button
│   │   ├── vendor/            # Vendor dashboard widgets
│   │   │   └── onboarding/    # 6-step vendor signup wizard
│   │   └── ui/                # ~90 shadcn primitives + app extensions
│   ├── config/                # categories, navigation trees, platform settings
│   ├── contexts/              # React Context providers (cart, wishlist, location, etc.)
│   ├── data/                  # mock-data.ts (dev fixtures / fallback)
│   ├── hooks/                 # Custom hooks (useAuth, data hooks, react-query hooks)
│   ├── integrations/
│   │   ├── lovable/           # Lovable platform integration
│   │   └── supabase/          # client.ts (generated) + types.ts (generated schema)
│   ├── lib/                   # Utilities + Zod validators/
│   ├── pages/                 # Route components
│   │   ├── account/           # Account security
│   │   ├── admin/             # Admin dashboard pages
│   │   ├── auth/              # Forgot/reset password, OTP, callback
│   │   └── vendor/            # Vendor dashboard pages
│   ├── services/              # Data-access layer (all Supabase access lives here)
│   ├── test/                  # Test setup
│   ├── types/                 # Domain TypeScript models
│   ├── App.tsx                # Router + provider tree
│   └── main.tsx               # Entry point
└── supabase/
    ├── config.toml            # Project id + per-function verify_jwt config
    ├── functions/             # 20 Edge Functions + _shared/ + _tests/
    └── migrations/            # 84 SQL migrations (schema, RLS, functions, triggers)
```

### What each `src` folder does

- **`components/`** — Presentation. Grouped by feature domain rather than by type. `ui/` holds
  the shadcn primitive library; every other subfolder is app-specific.
- **`config/`** — Static, code-defined configuration: category taxonomy, role-scoped navigation
  trees, and platform settings (with DB-backed overrides).
- **`contexts/`** — Cross-cutting client state that many components read (cart, wishlist,
  location, currency, sidebar). Persisted to localStorage/sessionStorage and/or Supabase.
- **`hooks/`** — Reusable logic, including the **auth backbone** (`useAuth`) and React Query
  data hooks (checkout quote, serviceability, nav badges, recently viewed).
- **`integrations/supabase/`** — Auto-generated Supabase client and the generated `Database`
  type. Marked "do not edit."
- **`lib/`** — Framework-agnostic utilities (retry, rate-limit, logging, sanitize, image
  compression, printing) and the Zod `validators/` directory.
- **`pages/`** — One component per route; lazy-loaded for auth/role-guarded areas.
- **`services/`** — The single boundary to the backend. All table queries, RPC calls,
  edge-function invocations, Storage, and Realtime go through here.
- **`types/`** — Domain models (camelCase) mapped from snake_case DB rows.

---

## 3. Application Bootstrap & Provider Hierarchy

`src/main.tsx` mounts `<App />`. `src/App.tsx` composes the entire provider tree and router:

```
QueryClientProvider
└─ ErrorBoundary
   └─ TooltipProvider
      └─ ThemeProvider              (light/dark, localStorage: nexus_theme)
         └─ AuthProvider            (Supabase session, roles, vendor status)
            └─ CurrencyProvider     (INR-only)
               └─ LocationProvider  (delivery pincode/city, serviceability)
                  └─ CartProvider   (cart items, buy-now, COD availability)
                     └─ WishlistProvider
                        └─ BrowserRouter
                           └─ SidebarProvider
                              ├─ ShopSidebar        (shopper nav drawer)
                              ├─ Header
                              ├─ main → Suspense → Routes
                              ├─ Footer
                              └─ WhatsAppFloatingButton
```

**Ordering matters:** `AuthProvider` sits high because `LocationProvider`, `CartProvider`,
`WishlistProvider`, and the nav hooks all depend on auth state (e.g., guest→auth wishlist merge,
saved addresses). Routes are wrapped in `<Suspense fallback={<PageSkeleton/>}>` because most
non-public pages are `React.lazy`-loaded for code-splitting.

---

## 4. Routing Map

Public routes are eagerly imported; authenticated/role-guarded routes are lazy-loaded.

### Public routes
| Path | Page |
|---|---|
| `/` | HomePage |
| `/search` | SearchPage |
| `/product/:slug` | ProductDetailPage |
| `/store/:slug` | VendorStorePage (public vendor storefront) |
| `/cart` | CartPage |
| `/wishlist` | WishlistPage |
| `/auth` | AuthPage |
| `/auth/forgot-password` | ForgotPasswordPage |
| `/auth/reset-password` | ResetPasswordPage |
| `/auth/verify-otp` | OtpVerifyPage |
| `/auth/callback` | AuthCallbackPage |
| `/terms-and-conditions`, `/refund-return-policy`, `/privacy-policy`, `/about-us`, `/support` | Static/policy pages |

### Authenticated routes (`<ProtectedRoute>`)
| Path | Page |
|---|---|
| `/checkout` | CheckoutPage |
| `/profile` | ProfilePage |
| `/account/security` | AccountSecurityPage |
| `/payments`, `/payments/:paymentId` | PaymentsListPage / PaymentDetailPage |
| `/payment/success`, `/payment/failed` | Payment result pages |
| `/vendor/apply`, `/vendor/apply/kyc` | VendorOnboardingPage / VendorKYCPage |

### Vendor routes — `/vendor/*` (`<RoleRoute requiredRole="vendor">` → `<VendorStatusGate>` → `<VendorDashboard>` with nested `<Outlet>`)
`index` → VendorOverview · `products` · `orders` · `returns` · `campaigns` · `analytics` · `payments` · `notifications` · `settings`

### Admin routes — `/admin/*` (`<RoleRoute requiredRole="admin">` → `<AdminDashboard>` with nested `<Outlet>`)
`index` → AdminOverview · `vendors` · `campaigns` · `placements` · `payouts` · `reviews` · `pricing` · `security` · `payments` · `settings` · `menu`

`*` → NotFound (404).

Navigation itself is **data-driven** from `src/config/navigation.ts` (`shopperNav`, `vendorNav`,
`adminNav`), filtered by role via `filterSections()`. Some nav items carry `badgeKey`s
(e.g., `pendingVendors`, `newOrders`, `unreadNotifications`) whose counts come from React Query
badge hooks. The sidebar tree can additionally be extended by an **admin-managed menu** stored in
the `menu_items` table and served by the `menu` / `get-sidebar-menu` edge functions.

---

## 5. Authentication Flow

### Client auth state — `src/hooks/useAuth.tsx`

`AuthProvider` is the auth backbone. On mount it:
1. Subscribes to `supabase.auth.onAuthStateChange` and calls `getSession()`.
2. On a session, loads **roles** from `user_roles` and the **vendor row** via the
   `get_my_vendor` RPC (returning `vendorId`, `verification_status`, `kyc_status`).
3. Exposes `{ user, session, loading, roles, isVendor, isAdmin, vendorId, vendorStatus, kycStatus, refreshVendor, signOut }`.

It also enforces a **30-minute idle timeout** (mouse/key/scroll/touch listeners reset the timer;
on expiry it logs a `signout` event and calls `supabase.auth.signOut({ scope: "local" })`).
Auth events are recorded through `logAuthEvent` → `log-auth-event` edge function.

The Supabase client (`src/integrations/supabase/client.ts`) is configured with
`storage: localStorage`, `persistSession: true`, `autoRefreshToken: true`, keyed off
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Route guards — `src/components/auth/`

Three composable guards, all driven by `useAuth()`:

- **`ProtectedRoute`** — authentication gate. Spinner while `loading`; `<Navigate to="/auth" replace>` when `!user`; else renders children.
- **`RoleRoute`** (`requiredRole: "vendor" | "admin"`) — authorization gate. After auth check, renders an "Access Denied" screen if `!roles.includes(requiredRole)` (does not redirect).
- **`VendorStatusGate`** — vendor-lifecycle gate inside the vendor area. Branches on `vendors.verification_status`:
  - no `vendorId` → "Become a Vendor / Apply Now"
  - `verified`/`approved` → renders dashboard
  - `suspended` → suspension screen (+ support contact)
  - `rejected` → "Update KYC & Reapply"
  - `pending` → "Application Under Review" with a KYC-completion checklist

Typical composition: `ProtectedRoute → RoleRoute("vendor") → VendorStatusGate → VendorDashboard`.

### Additional auth surfaces
- **OTP / phone**: `otp-send` / `otp-verify` edge functions + `useOtpCountdown` + `otpClient.ts`.
- **Auth emails**: the `auth-email-hook` edge function renders React-Email templates
  (`_shared/email-templates/`: signup, magic-link, recovery, invite, email-change, reauthentication).
- **Rate limiting**: client-side `rateLimiter.ts` and DB-side `check_auth_rate_limit` / `auth_rate_limits`.
- **Server enforcement**: roles are verified in the DB via a `SECURITY DEFINER` `has_role()` helper used throughout RLS policies — the client role list is convenience only, never the security boundary.

---

## 6. Supabase Integration

### Client
- `src/integrations/supabase/client.ts` — generated, typed `createClient<Database>`.
- `src/integrations/supabase/types.ts` — large generated schema type (source of truth for TS).

### Service layer — `src/services/` (the backend boundary)

Every backend touch is centralized here; components/hooks never call `supabase` directly for
domain data (only auth/session). Rows are mapped snake_case → camelCase (`mapDbProduct` is the
canonical adapter). Two caching tiers coexist: a hand-rolled `cacheService` (TTL `Map` with
pattern invalidation) fronts read-heavy calls, while React Query manages staleness/refetch in hooks.

| Service | Responsibility |
|---|---|
| `productService` | Product CRUD, `getBySlug`/`getByVendor`, ranked/trending via RPC, image upload |
| `vendorService` | Public vendor columns + KYC/financials via `SECURITY DEFINER` RPCs, KYC submit/approve, uploads |
| `orderService` | User/vendor orders, shipment events, status updates (order *creation* is server-side) |
| `paymentService` | Checkout orchestration: `create-checkout`, Razorpay, UPI, proofs, payouts, commission |
| `analyticsService` | `trackEvent` (RPC) + client-side dashboard aggregation |
| `aiRecommendationService` | Composite-scored recommendations from a user-behavior profile |
| `recommendationService` | Recently-viewed, similar, frequently-bought-together |
| `searchService` | `search_products` RPC + suggestions; localStorage search history |
| `locationService` | `location` edge fn (IP geo, reverse geocode, pincode), serviceability RPCs, saved addresses |
| `sidebarMenuService` | Admin-managed nav tree (`menu` / `get-sidebar-menu`) |
| `reviewService` | Reviews CRUD + moderation, media uploads, helpful votes, `can_review_product` |
| `adService` | Ad campaigns/placements, auction winners, impression/click tracking |
| `inventoryService` | `reserve_stock` / `confirm_stock` / `release_stock` RPCs |
| `pricingService` | Dynamic pricing rules, suggestions, `recalculate-prices` |
| `notificationService` | Notifications + realtime `postgres_changes` subscription |
| `realtimeService` | Generic table subscribe/unsubscribe helper |
| `cacheService` | In-memory TTL cache |
| `currencyService` | INR-only identity (format/convert no-ops) |

### Edge Functions — `supabase/functions/` (20)

`config.toml` sets `verify_jwt` per function (money/webhook functions verify signatures internally).

| Function | Purpose |
|---|---|
| `create-checkout` | **Source of truth**: re-prices from DB, reserves stock, creates order + items + payment + gateway artifact |
| `quote-checkout` | Read-only server price quote (no writes/stock) |
| `create-razorpay-order` | Creates Razorpay order from server-computed total |
| `verify-razorpay-payment` | Verifies Razorpay signature (constant-time), reconciles local records |
| `razorpay-webhook` | Backup server verification for `payment.captured`/`failed` |
| `confirm-upi-payment` | User-authenticated UPI confirmation (bypasses missing UPDATE RLS) |
| `verify-upi-payment` | Admin-side UPI verification via service role |
| `admin-resync-payment` | Admin reconciliation against Razorpay (`verify_jwt=true`) |
| `recalculate-prices` | Recomputes dynamic product prices (admin-gated) |
| `location` | IP geolocation (ipapi.co) with in-memory cache |
| `menu` / `get-sidebar-menu` | Admin-managed sidebar menu CRUD + tree build |
| `otp-send` / `otp-verify` | Phone OTP send/verify |
| `auth-email-hook` | Renders React-Email auth templates |
| `send-transactional-email` | Brevo sender (order_confirmation, return_requested) |
| `process-email-queue` | Drains email queue, handles 429/DLQ (`verify_jwt=true`) |
| `log-auth-event` | Logs pre-auth events (login/signup failures) |
| `test-bootstrap` | Seeds deterministic test users/vendor (secret-gated; non-prod) |

`_shared/` holds shared pricing logic (`pricing.ts`) and email templates; `_tests/` holds edge-function tests.

---

## 7. Database Usage

84 migrations define the schema. **All tables have RLS enabled.** Only one Postgres enum exists —
**`app_role`** (`user | vendor | admin`); other status fields are `TEXT` with app-level constraints.

### Main tables by domain

- **Identity/roles**: `user_roles`, `profiles`
- **Catalog/commerce**: `vendors`, `products` (with a `search_vector` tsvector), `orders`, `order_items`, `wishlist_items`
- **Reviews**: `reviews`, `review_helpful_votes`
- **Payments**: `payments`, `payment_audit_log`, `payment_logs`, `webhook_events` (idempotency)
- **Payouts/wallet**: `payouts` (legacy), `payout_requests` (current), `vendor_wallet_ledger`
- **Ads**: `ad_campaigns`, `ad_placements`
- **Analytics/fraud**: `analytics_events`, `suspicious_clicks`
- **Fulfillment**: `shipment_events`, `notifications`
- **Pricing/config**: `pricing_rules`, `platform_settings`, `menu_items`
- **Location/serviceability**: `user_locations`, `serviceable_pincodes`, `vendor_serviceability`
- **Vendor onboarding/audit**: `vendor_onboarding_drafts`, `vendor_audit_log`
- **Auth security**: `auth_events`, `user_sessions`, `auth_rate_limits`, `phone_otps`
- **Email infra**: `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`

### RLS & security model

- **Public read** on catalog data (`products`, `vendors`, `profiles`, `reviews`, `ad_placements`).
- **Owner-scoped writes** via `auth.uid() = user_id`.
- **Role gating** through a `SECURITY DEFINER` `has_role(uid, role)` helper (avoids recursive RLS on `user_roles`).
- **Sensitive data** (KYC/bank/financials, admin lists, moderation) is revoked at table level and exposed only through `SECURITY DEFINER` RPCs (`get_my_vendor`, `get_vendor_financials`, `list_vendors_admin`, `list_reviews_admin`, etc.).

### Notable functions & triggers

- **User bootstrap**: `handle_new_user` (auto-creates profile + default role on `auth.users` insert).
- **Stock lifecycle**: `reserve_stock` / `confirm_stock` / `release_stock`, `sweep_stale_orders` (cron releases abandoned reservations).
- **Search/ranking**: `search_products`, `get_ranked_products`, `get_trending_products`, `get_local_deals`, `calculate_product_scores`.
- **Ads auction**: `track_ad_event`, `get_auction_winners`, `recalculate_ad_quality_score`, `on_purchase_conversion`.
- **Trust/fraud**: `recalculate_vendor_trust_score`, `detect_abnormal_purchases`, `flag_suspicious_review`.
- **Payments**: `on_payment_success`, audit/log triggers, `notify_admins_of_payment_alert`, `flag_unreconciled_razorpay_orders`.
- **Vendor finance/returns**: `on_cod_delivered_credit`, `validate_payout_request`, `debit_balance_on_payout_complete`, `vendor_approve_return` / `vendor_reject_return`.
- **Notifications**: `create_notification` + many `on_*_notify_*` triggers.
- **Email queue**: `enqueue_email`, `read_email_batch`, `move_to_dlq`.

### Storage buckets

`product-images` (public), `vendor-kyc` (private), `payment-proofs` (private), `return-photos`,
`review-images` / `review-videos`, `admin` (admin-only).

> **Caveat:** several functions/tables are redefined across migrations (e.g. `handle_new_user`
> multiple times; both `payouts` and `payout_requests` exist). The **latest** migration wins —
> treat earlier-dated definitions as superseded.

---

## 8. Client State Management

State is split by nature: **server-state → React Query**; **UI/session-state → Context + storage**.

| Provider | State | Persistence |
|---|---|---|
| `AuthProvider` (`hooks/useAuth`) | user, session, roles, vendor status | Supabase session (localStorage) |
| `ThemeProvider` (`hooks/useTheme`) | light/dark | localStorage `nexus_theme` |
| `CartContext` | items, quantities, buy-now, totals, COD/serviceability | localStorage `marketplace_cart`; buy-now in sessionStorage |
| `WishlistContext` | wishlisted product IDs (optimistic; guest→auth merge) | localStorage (guest) + `wishlist_items` (authed) |
| `LocationContext` | active pincode/city/state, saved locations | localStorage `nexus_location` + `user_locations` |
| `CurrencyContext` | INR-only helpers | none (constant) |
| `SidebarContext` | open/close, Cmd/Ctrl+B shortcut | in-memory |

**Key data hooks**: `useCheckoutQuote` (server-authoritative pricing), `useServiceability`
(batched pincode checks), `useNavigation` + badge hooks, `useRecentlyViewed`, `useVendor`,
`useOnboardingDraft` (debounced autosave), `useRealtimeSubscription`.

---

## 9. Component Hierarchy (by surface)

### Shared chrome
`Header` (search, cart, notifications bell, location pill, sidebar toggle) · `Footer` ·
`ShopSidebar` (data-driven drawer) · `DashboardLayout` (vendor/admin shell with
`DashboardSidebar`) · `ErrorBoundary` · `PageSkeleton`.

### Customer storefront
```
HomePage → hero, SponsoredProductCard grid, RegionRecommendations, LocalDeals,
           KashmirCategories, RecentlyViewedSection, StorySection
SearchPage → SearchBar + filters + ProductGrid(ProductCard/SponsoredProductCard) + ServiceabilityBadge
ProductDetailPage → gallery, PriceDisplay, RatingStars, WishlistButton, badges,
                    ReviewSection(ReviewSummary, ReviewForm, ReviewCard, ReviewImageGallery), related
CartPage → line items, ServiceabilityBadge, server-verified subtotal (useCheckoutQuote)
CheckoutPage → shipping form, payment selector, order summary, PricingDebugBox
ProfilePage → orders (invoice/return-slip print, ReturnRequestModal), notifications,
              payments, SavedAddresses, support, sign-out
```

### Vendor dashboard (`DashboardLayout variant="vendor"`, `vendorId` via Outlet context)
`VendorOverview` (KPIs, charts, VendorGettingStarted, StorefrontLinkCard) · `VendorProducts`
(ProductForm) · `VendorOrders` (VendorOrderDetailsDialog) · `VendorReturns` · `VendorCampaigns`
(CampaignForm) · `VendorAnalytics` (TimeRangeSelector + recharts) · `VendorPayments` ·
`VendorNotifications` · `VendorSettings` (ShippingServiceabilityCard) · `VendorKYCPage`.
Onboarding wizard: `OnboardingShell` + `OnboardingStepper` + `Step1..Step6` + `FileDropzone` + `PhoneOtpInput`.

### Admin dashboard (`DashboardLayout variant="admin"`, `useAdminBadges`)
`AdminOverview` (GMV/commission charts) · `AdminVendors` (KYCReviewSheet, verify/suspend,
commission-exempt toggle) · `AdminCampaigns` · `AdminPlacements` · `AdminPayouts` ·
`AdminReviews` · `AdminPricing` · `AdminSecurity` (fraud) · `AdminPayments` (UPI proof approval) ·
`AdminSettings` · `AdminMenu` (MenuTreeEditor, MenuItemForm).

---

## 10. Checkout Flow (detailed)

`CheckoutPage` is a single-page state machine:
`FlowState = "form" | "processing" | "success" | "failed" | "upi_pending" | "razorpay_pending"`.

1. **Shipping form** — name, phone, email (prefilled), address, city, state, 6-digit pincode, notes.
2. **Payment method** — loaded from `fetchPaymentMethodSettings()`:
   - **Razorpay** (recommended default) — UPI/cards/netbanking/wallets.
   - **Cash on Delivery** — disabled when `!codAvailable` for the PIN or any item has `allowCod === false`.
   - **Direct Influencer UPI override** — if the whole cart is from a single commission-exempt
     vendor with a personal UPI/QR (`get_vendor_direct_checkout`), the standard selector is hidden
     and the buyer pays the vendor directly.
3. **Server-verified quote** — `useCheckoutQuote()` re-prices on the server; "Place Order" is
   disabled until a valid quote loads; a drift warning shows if server subtotal ≠ client total.
4. **Order creation** (`handlePlaceOrder`) — client validation → `paymentService.startCheckout`
   → **`create-checkout` edge fn** which re-prices from DB, reserves stock, and creates
   order + items + payment (+ gateway artifact). **Idempotent** (stable sessionStorage key +
   `withRetry`), so double-clicks collapse to one order. `AMOUNT_MISMATCH` → "refresh and retry".
5. **Settlement branch**:
   - **COD** → immediate success, `clearCart`, order-confirmation email, `/payment/success`.
   - **UPI** → `upi_pending` QR screen; on "I Have Paid" → optional proof upload to private
     `payment-proofs` bucket → `confirm-upi-payment` → success (**pending admin verification** in
     AdminPayments).
   - **Razorpay** → dynamically loads checkout.js, opens modal (amount in paise, vendor display
     name via `get_vendor_checkout_name`); handler → `verify-razorpay-payment`; dismiss → failed.
6. **Terminal states** — dedicated success/failed screens; **Retry** issues a brand-new server
   checkout (stale reservation released by `sweep_stale_orders` cron).

**Design principle:** the client never sends prices — pricing, stock, order creation, and payment
verification are all server-authoritative.

---

## 11. Areas Suitable for AI Integration

The codebase already has scaffolding that makes several AI features low-friction to add. Ranked
by leverage:

1. **Recommendations / personalization** — `aiRecommendationService.ts` and
   `recommendationService.ts` already build a user-behavior profile from `analytics_events` and
   compute composite scores. This is the natural home for an LLM/embedding-based upgrade
   (semantic "because you viewed", cross-sell, cold-start). Product `search_vector` exists;
   adding a **pgvector** embedding column would enable semantic + hybrid search.

2. **Search relevance & query understanding** — `searchService` + `search_products` /
   `get_search_suggestions` RPCs are a clean seam for LLM query expansion, spelling correction,
   and natural-language filters ("cheap pashmina under 5000 that ships to Srinagar").

3. **Dynamic pricing** — `pricingService` + `pricing_rules` + `recalculate-prices` edge fn +
   AdminPricing UI already model rule-based pricing. An ML/AI pricing-suggestion engine can plug
   into `getPricingSuggestions` and surface in the existing admin/vendor UI.

4. **Fraud & trust** — `suspicious_clicks`, `detect_abnormal_purchases`,
   `recalculate_vendor_trust_score`, `flag_suspicious_review`, and AdminSecurity provide labeled
   signals ideal for anomaly-detection / review-authenticity models.

5. **Review moderation & summarization** — `reviewService` + moderation pipeline + review media.
   LLM summaries ("what buyers say"), toxicity/spam classification, and image-content checks fit
   the existing `flag_suspicious_review` flow.

6. **KYC / onboarding automation** — the 6-step vendor wizard + `vendor-kyc` documents +
   `validate_vendor_kyc_fields` are a candidate for document OCR/verification and auto-triage
   before human admin review.

7. **Customer support** — `WhatsAppFloatingButton` + `supportConfig.ts` + SupportPage is a ready
   entry point for an AI support assistant grounded in orders/returns/policies.

8. **Vendor analytics copilot** — `analyticsService` already aggregates rich per-vendor series;
   a natural-language "explain my sales / what should I restock" assistant could sit on top of it.

9. **Content generation** — product listing creation (`ProductForm`) and ad campaigns
   (`CampaignForm`) are obvious spots for AI-assisted titles/descriptions/imagery.

> **Integration guidance:** follow the existing seam — put model calls behind a new **edge
> function** (keeps keys server-side, mirrors `create-checkout`/`recalculate-prices`) and expose
> them through a **service module** in `src/services/`, consumed via a **React Query hook**. This
> preserves the codebase's clean "server is the source of truth, client goes through the service
> layer" architecture.

---

## 12. Summary of Architectural Strengths

- **Clean service-layer boundary** — all backend access funnels through `src/services/`.
- **Server-authoritative money & inventory** — pricing, order creation, stock, and payment
  verification live in edge functions; the client never sends prices; checkout is idempotent.
- **Security-definer RPC pattern** cleanly separates public data from KYC/bank/financial data.
- **Data-driven, role-filtered navigation** with an admin-editable menu overlay.
- **Two-tier caching** (`cacheService` + React Query) and clear state separation
  (server-state vs. UI/session-state).
- **Explicit guest→auth migration** for wishlist, recently-viewed, and search history.

---

*Generated as a read-only analysis. No application code was modified.*
