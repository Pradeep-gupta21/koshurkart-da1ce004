

## Platform Constraint

This project runs on **Lovable**, which uses **React + Vite + TypeScript** with **Lovable Cloud (PostgreSQL)** for the backend. Next.js, MongoDB, Mongoose, and NextAuth **cannot run here** — they require a Node.js server runtime that this platform does not provide.

Your project already has a working database with 10 tables, RLS security policies, authentication, and a vendor dashboard. The requested architecture can be implemented as a **structural refactor** using the equivalent technologies already in place.

## Equivalence Map

| Requested | Already Available |
|---|---|
| Next.js App Router | React Router (nested routes) |
| MongoDB + Mongoose | PostgreSQL via Lovable Cloud |
| NextAuth | Lovable Cloud Auth (`useAuth.tsx`) |
| API routes | RLS policies + Edge Functions |
| Middleware | RLS + `has_role()` function |
| Zod | Will add — already supported |

## Plan: Architecture Refactor

### 1. Split types into separate files
Break `src/types/index.ts` into `user.ts`, `product.ts`, `order.ts`, `ads.ts` with barrel re-export.

### 2. Create service layer (`src/services/`)
Extract all database queries from page components into:
- `productService.ts` — CRUD, search, filtering
- `orderService.ts` — create orders, fetch history
- `adService.ts` — campaign CRUD, placements
- `vendorService.ts` — vendor profile, verification
- `paymentService.ts` — payouts, earnings
- `analyticsService.ts` — dashboard stats

### 3. Add Zod validators (`src/lib/validators/`)
- `productSchema.ts` — title, price, stock, images
- `orderSchema.ts` — items, shipping address
- `campaignSchema.ts` — budget, dates, placement
- `reviewSchema.ts` — rating, comment
- `userSchema.ts` — signup, profile update

### 4. Build reusable UI components
- `src/components/product/SponsoredProductCard.tsx` — extends ProductCard with sponsored styling
- `src/components/product/RatingStars.tsx` — extract from ProductDetailPage
- `src/components/product/PriceDisplay.tsx` — price with optional discount
- `src/components/product/ProductGrid.tsx` — responsive grid with loading state
- `src/components/vendor/VendorCard.tsx` — logo, name, rating, sales
- `src/components/ui/SkeletonLoader.tsx` — product/vendor/page skeleton variants

### 5. Extract hooks
- `src/hooks/useVendor.tsx` — vendor data fetching and state
- Refactor `CartContext` to also export a `useCart` hook cleanly

### 6. Organize forms
- `src/components/forms/ProductForm.tsx` — extract from VendorProducts
- `src/components/forms/CampaignForm.tsx` — extract from VendorCampaigns
- `src/components/forms/CheckoutForm.tsx` — extract from CheckoutPage

### Final Structure

```text
src/
  components/
    ui/            (shadcn — existing)
    layout/        Header, Footer
    product/       ProductCard, SponsoredProductCard, RatingStars, PriceDisplay, ProductGrid
    vendor/        VendorCard
    dashboard/     StatCard, DataTable
    forms/         ProductForm, CampaignForm, CheckoutForm
    ads/           SponsoredBanner
  services/        productService, orderService, adService, vendorService, paymentService, analyticsService
  lib/
    validators/    Zod schemas
    utils.ts
  hooks/           useAuth, useCart, useVendor
  types/           user.ts, product.ts, order.ts, ads.ts, index.ts (barrel)
  contexts/        CartContext
  pages/           all existing pages
```

This touches ~25 files (create ~18 new, modify ~7 existing) with no functionality changes — purely organizational.

