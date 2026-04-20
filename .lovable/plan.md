

## Reality check

Most of this spec is **already built**. Let me map it.

| Spec | Status | Where |
|---|---|---|
| Logged-out → localStorage | ✅ | `LocationContext` key `lovable.location.v1` |
| Logged-in → DB + sync | ✅ | `user_locations` table + RLS + `enforce_single_default_location` trigger |
| Validate inputs | ✅ | Zod schema in `validators/locationSchema.ts`, server-side validation in edge function |
| Fallback to default | ✅ | IP detect → fallback location in `LocationContext.detectAuto` |
| Multi-vendor delivery areas | ✅ | `vendor_serviceability` table + `check_serviceability` RPC already joins vendor rules |
| Caching | ✅ | `cacheService` with TTLs; `serviceable_pincodes` queries hit it |
| Rate limiting | ⚠️ Skipped per project policy (no backend rate-limit primitives — known gap) |

### Actual gaps

1. **Product cards don't show delivery ETA** — `check_serviceability` returns `eta_days` but `ProductCard` ignores it.
2. **PDP doesn't show "Delivery by [date]"** — same RPC unused on `ProductDetailPage`.
3. **Search/grid doesn't filter unserviceable products** — all products shown regardless of pincode.
4. **Cart/Checkout doesn't add shipping surcharge** — `surcharge_pct` from pincode is fetched but never applied to totals.
5. **No "local deals" section** — homepage shows global trending only; no region-aware slice.

## Plan — wire location into commerce

### 1. Delivery ETA badge on ProductCard + PDP
- New hook `useServiceability(productIds[])` — calls `locationService.checkServiceability(pincode, ids)`, memoized per (pincode, ids), cached via `cacheService` with 10min TTL.
- `ProductCard`: small badge under price → `Delivery by Apr 25` (computed from `eta_days`) or `Not deliverable to {pincode}` (muted, strike-through CTA).
- `ProductDetailPage`: prominent block above "Add to cart" → `Delivery by {date} • {COD available?} • +{surcharge_pct}% shipping` with a "Change location" link opening `LocationDialog`.
- Date helper: `addBusinessDays(today, eta_days)` formatted via `Intl.DateTimeFormat`.

### 2. Filter unserviceable products in lists
- `ProductGrid` accepts optional `hideUnserviceable` prop (default `false` for browsability — Amazon shows all but flags unavailable).
- Better UX: **show all, dim + disable cart button** for unserviceable. Add a sort: deliverable items first.
- New filter chip on `SearchPage`: "Deliverable to my PIN" toggle that filters the result set.

### 3. Shipping cost in Cart + Checkout
- `CartContext` adds derived `shippingTotal` = `sum(item.price * item.qty * surcharge_pct/100)` per item, using cached serviceability for the active pincode.
- `CartPage`: line in totals → `Shipping (to {city} {pincode}): ₹{x}`.
- `CheckoutPage`: same, plus block proceed if any item is unserviceable with toast + "Change location".
- COD payment method auto-disabled if any item's pincode has `cod_available = false`.

### 4. Local deals section on homepage
- New homepage section `<LocalDeals />` between hero and trending.
- Calls a new RPC `get_local_deals(_pincode text, _limit int)` → returns active products with active discounts where `vendor_serviceability` matches the pincode pattern, ordered by `discount_pct DESC`.
- Falls back to global trending if pincode is null/unknown.
- Title: "Deals near {City}".

### 5. Cache layer
- Wrap `checkServiceability` calls in `cacheService` with key `serviceability:{pincode}:{sortedProductIds}` and 10min TTL.
- Wrap `get_local_deals` in `cacheService` with key `local-deals:{pincode}` and 5min TTL.
- Invalidate keys when user changes location (hook into `LocationContext.setByPincode` / `useLocation` change).

### 6. Multi-vendor handling
- Already correct — `check_serviceability` LEFT JOINs `vendor_serviceability` per product, so vendor-specific rules naturally win over the default pincode config. No changes needed; just surface the per-product `eta_days` in UI (covered above).

### 7. Personalization
- Beyond local deals, add a small `<RegionalCategories />` strip showing top 4 categories most-purchased in the user's `state` (from `analytics_events` joined with `user_locations`). Lower priority — gate behind a feature flag in `platformSettings` (`enable_regional_categories`).

### 8. Security
- Existing Zod validation on pincode (6-digit India regex) is sufficient client-side.
- Edge function `location/index.ts` already validates inputs; no SQL injection vectors since all queries use parameterized RPC.
- **Rate limiting: skipped** per project policy — backend lacks primitives. Documented as known gap.

## Files

### Create
- `src/hooks/useServiceability.ts` — cached batch serviceability lookup
- `src/components/product/DeliveryBadge.tsx` — shared "Delivery by X" badge
- `src/components/home/LocalDeals.tsx` — homepage section
- Migration for new RPC `get_local_deals(_pincode text, _limit int default 8)`

### Edit
- `src/components/product/ProductCard.tsx` — add `<DeliveryBadge />`
- `src/pages/ProductDetailPage.tsx` — prominent delivery block + change-location link
- `src/components/product/ProductGrid.tsx` — sort deliverable first
- `src/pages/SearchPage.tsx` — "Deliverable" filter chip
- `src/contexts/CartContext.tsx` — derive `shippingTotal` from per-item surcharge
- `src/pages/CartPage.tsx` — render shipping line
- `src/pages/CheckoutPage.tsx` — render shipping, block on unserviceable, gate COD
- `src/pages/HomePage.tsx` — render `<LocalDeals />`
- `src/services/locationService.ts` — wrap `checkServiceability` in `cacheService`; add `getLocalDeals(pincode)`

### No changes needed
- `LocationContext`, `LocationDialog`, `LocationPill`, `user_locations`, `serviceable_pincodes`, `vendor_serviceability`, RLS policies — all already correct

## Out of scope
- Backend rate limiting (project policy — no primitives yet)
- Real-time delivery date updates (eta_days is static per pincode; courier API integration is separate)
- Geofenced ad targeting (separate ads-system concern)
- Replacing the LocalStorage cart for guests (cart-system memory says current behavior is intentional)

