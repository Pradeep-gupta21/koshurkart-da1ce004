

## Vendor Reputation System — Implementation Plan

### Current State
- `vendors` table has `rating`, `total_sales`, `verification_status` — no trust score or performance metrics
- `Vendor` TypeScript type has basic fields only
- Admin can approve/reject/suspend vendors but no granular verification toggle
- Product detail page shows vendor name but no trust indicators
- VendorCard shows rating and sales count

### Plan

#### 1. Database Migration
Add columns to `vendors` table:
- `trust_score NUMERIC DEFAULT 0`
- `delivery_rate NUMERIC DEFAULT 100`
- `cancellation_rate NUMERIC DEFAULT 0`
- `return_rate NUMERIC DEFAULT 0`
- `review_rating NUMERIC DEFAULT 0`
- `is_verified BOOLEAN DEFAULT false`

Create a `recalculate_vendor_trust_score(p_vendor_id UUID)` security-definer function that:
1. Calculates `review_rating` from avg of product reviews
2. Reads `delivery_rate`, `cancellation_rate`, `return_rate` from the vendor row
3. Computes `trust_score = 0.4 * (review_rating / 5 * 100) + 0.3 * delivery_rate + 0.2 * (100 - return_rate) + 0.1 * (100 - cancellation_rate)`
4. Updates vendor row with computed values

Add `order_status` values support — the existing orders table already has `order_status` (processing/shipped/delivered). We'll add 'cancelled' and 'returned' as valid states and use them for metric calculation.

Create a trigger function `on_order_status_change()` that fires on `orders` UPDATE and calls `recalculate_vendor_trust_score` for affected vendors when status changes to delivered/cancelled/returned.

Create a trigger function `on_review_insert()` that recalculates vendor trust score when a review is submitted.

#### 2. Update TypeScript Types (`src/types/product.ts`)
Add to `Vendor` interface:
- `trustScore`, `deliveryRate`, `cancellationRate`, `returnRate`, `reviewRating`, `isVerified`

#### 3. Vendor Dashboard — Trust Score Card (`VendorOverview.tsx`)
Add a "Trust Score" card showing:
- Circular score indicator (0–100)
- Breakdown: delivery rate, cancellation rate, return rate, review rating
- Improvement suggestions (e.g., "Improve delivery rate to boost your score")

#### 4. Product Detail Page — Vendor Trust Indicators (`ProductDetailPage.tsx`)
Next to vendor name, show:
- Verified badge (shield icon) if `is_verified`
- Trust score badge (color-coded: green >80, yellow >60, red ≤60)
- Vendor rating summary

#### 5. Product Card — Verified Badge (`ProductCard.tsx`)
Add a small verified checkmark next to vendor name when vendor is verified.

#### 6. Admin Panel — Manual Verification (`AdminVendors.tsx`)
Add a "Verify" toggle button that sets `is_verified = true/false` independently of approval status.
Show trust score in the vendor list.

#### 7. Vendor Service Updates (`vendorService.ts`)
Add `getTrustMetrics(vendorId)` function.

### Files to Create/Modify
- **Migration**: Add columns, create `recalculate_vendor_trust_score` function, triggers
- **Modify**: `src/types/product.ts` — extend Vendor interface
- **Modify**: `src/services/vendorService.ts` — add trust metrics query
- **Modify**: `src/pages/vendor/VendorOverview.tsx` — trust score card with breakdown + suggestions
- **Modify**: `src/pages/ProductDetailPage.tsx` — vendor trust indicators
- **Modify**: `src/components/product/ProductCard.tsx` — verified badge
- **Modify**: `src/components/vendor/VendorCard.tsx` — verified badge + trust score
- **Modify**: `src/pages/admin/AdminVendors.tsx` — verification toggle + trust score display

