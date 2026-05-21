# UI Consistency Pass — Koshur Kart

The token system in `src/index.css` and `tailwind.config.ts` is already in place, but pages and components drift from it (hardcoded colors in a few spots, inconsistent paddings, mixed button sizes/variants, ad-hoc card chrome, weak dark mode coverage). This plan tightens everything against one unified system without changing business logic.

## 1. Lock the design system (foundation)

Refine `src/index.css`:
- Re-tune light tokens for a cleaner Amazon/Shopify/Apple feel: softer `--background` (near-white), neutral `--card` (pure white), warmer borders, calmer muted.
- Re-tune dark tokens: keep card a half-step lighter than background (no pure black), borders at low-alpha neutral (drop the walnut tint that muddies dark mode), readable `--muted-foreground`.
- Standardize `--radius` to `0.625rem` (10px) project-wide; ensure `xl/lg/md/sm` scale correctly.
- Add one canonical elevation scale: `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg` (replace ad-hoc `marketplace-shadow*`).
- Add a spacing rhythm contract (documented): page gutter `px-4 md:px-6 lg:px-8`, section `py-8 md:py-12`, card padding `p-4 md:p-6`, stack gap `gap-4 md:gap-6`.

Refine `tailwind.config.ts`:
- Expose `boxShadow.xs/sm/md/lg` mapped to the new CSS vars.
- Add `container` paddings per breakpoint matching the gutter rhythm.

## 2. Primitive component polish

- `components/ui/button.tsx`: add `xl` size, normalize heights (`h-9/h-10/h-11`), unified focus ring, smooth `transition-all`, consistent disabled/hover states, add `loading` prop pattern (spinner slot).
- `components/ui/card.tsx`: switch to token-driven shadow (`shadow-sm hover:shadow-md`), consistent `rounded-xl`, padding presets via variants (`default`, `compact`).
- `components/ui/input.tsx`, `textarea.tsx`, `select.tsx`: align heights, focus rings, dark-mode bg (`bg-background` not `bg-card`).
- `badge.tsx`: add `success/warning/info` variants tied to tokens.
- `dialog.tsx`, `drawer.tsx`, `alert-dialog.tsx`: replace `bg-white`/hardcoded colors with `bg-background`/`bg-card`.

## 3. Hardcoded color sweep

Replace direct color classes with tokens in:
- `src/pages/CheckoutPage.tsx`
- `src/components/dev/DevRoleSwitcher.tsx`
- `src/components/ui/{drawer,dialog,alert-dialog}.tsx`
- `src/components/reviews/ReviewImageGallery.tsx`

(Six files surfaced by ripgrep — surgical edits.)

## 4. Layout & shell consistency

- `Header.tsx`, `Footer.tsx`, `DashboardLayout.tsx`, `DashboardSidebar.tsx`, `ShopSidebar.tsx`: unify background (`bg-background`/`bg-card`), border (`border-border`), gutter, sticky behavior, mobile breakpoints. Ensure no `bg-white` regressions in dark mode.
- Confirm `<main>` containers use the standard gutter + max-width rhythm.

## 5. Page-level pass

For each route group, apply the spacing contract, replace ad-hoc cards with `<Card>` primitives, normalize headings (`text-2xl md:text-3xl font-serif`), section spacing, empty states, and skeleton sizing:

- Shop: `HomePage`, `SearchPage`, `ProductDetailPage`, `CartPage`, `CheckoutPage`, `PaymentSuccess/Failed/Detail`, `PaymentsListPage`, `ProfilePage`.
- Vendor: `VendorDashboard`, `VendorOverview`, `VendorProducts`, `VendorOrders`, `VendorAnalytics`, `VendorPayments`, `VendorCampaigns`, `VendorSettings`, `VendorNotifications`, `VendorKYCPage`.
- Admin: `AdminOverview`, `AdminVendors`, `AdminPayments`, `AdminPayouts`, `AdminReviews`, `AdminCampaigns`, `AdminPlacements`, `AdminPricing`, `AdminSecurity`, `AdminSettings`, `AdminMenu`.
- Auth/Onboarding: `AuthPage`, `VendorApplyPage`, `VendorOnboardingPage` + onboarding steps.

## 6. Product / commerce surfaces

- `ProductCard`, `SponsoredProductCard`: identical chrome (radius, shadow, hover lift, price typography, badge placement).
- `PriceDisplay`, `RatingStars`, badges: consistent sizing scale (sm/md/lg).
- `ProductGrid`: standard responsive grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`, `gap-4 md:gap-6`).

## 7. Dark mode polish pass

- Manually verify every page in dark mode: no white cards, no invisible borders, no low-contrast muted text.
- Adjust any component still relying on `bg-white`/Tailwind grays to use semantic tokens.
- Ensure images/illustrations have appropriate `dark:` treatments where needed (subtle ring or contrast wrapper).

## 8. Mobile responsiveness

- Audit at 360 / 414 / 768 widths: header collapse, sidebar drawer behavior, tables → stacked cards (admin/vendor lists), checkout single-column, sticky bottom CTA on mobile for product/cart pages.
- Replace fixed widths with fluid + `max-w-*`; ensure no horizontal scroll.

## 9. QA checklist (verify before done)

- Toggle light/dark on every top-level route, no broken contrast.
- Tab through forms — visible focus ring everywhere.
- Resize to mobile — no overflow, CTAs reachable.
- All buttons share variant set (no rogue `<button className="bg-...">`).
- Grep confirms zero remaining `bg-white|text-black|bg-gray-|text-gray-|bg-slate-|text-slate-` in `src/`.

## Out of scope

- No business logic, data fetching, or backend changes.
- No new features or routes.
- Razorpay/checkout flows untouched beyond visual tokenization.

## Technical details

```text
Token changes      → src/index.css, tailwind.config.ts
Primitive polish   → src/components/ui/*
Hardcoded sweep    → 6 files identified via ripgrep
Layout shell       → Header, Footer, Dashboard/Shop sidebars, layouts
Page passes        → ~35 page files (shop + vendor + admin + auth)
Commerce surfaces  → ProductCard, SponsoredProductCard, ProductGrid, PriceDisplay
```

Estimated scope: large but mechanical — mostly className normalization driven by a fixed contract, no new dependencies.
