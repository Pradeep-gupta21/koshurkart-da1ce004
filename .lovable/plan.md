
## Reality check

Most of this spec is already shipped. Honest gap analysis before proposing work:

| Spec ask | Status | Evidence |
|---|---|---|
| **Categories/products/vendors from backend** | ✅ | `productService`, `vendorService`, `menu_items` table — all live queries |
| **Location-based products + delivery estimates** | ✅ | `LocationContext`, `useServiceability`, `get_local_deals(_pincode)`, `serviceable_pincodes`, `vendor_serviceability` |
| **Lazy loading (routes)** | ✅ | `App.tsx` uses `React.lazy` + `Suspense` (verified last loop) |
| **Modular components / API-driven UI** | ✅ | Sidebar, ProductGrid, ProductCard, KashmirCategories all data-driven |
| **Local deals + region recommendations** | ✅ | `LocalDeals` calls `get_local_deals` with pincode; `aiRecommendationService` exists |
| **Mobile responsive** | ✅ | Tailwind breakpoints throughout; verified in last UI passes |
| **Clean architecture / reusable components** | ✅ | `components/ui`, `components/product`, `components/home`, services layer |
| **Image optimization** | ⚠️ Partial | `compressImage` exists for uploads. Display-side: no `loading="lazy"`, no width/height hints, no `decoding="async"` on `<img>` tags in `ProductCard`, `VendorCard`, `KashmirCategories`. CLS + bandwidth waste on slow J&K connections. |
| **Region-based "Recommended for you near {city}"** | ⚠️ Partial | Local deals exist; no homepage section that says "recommended for your region" with a city-aware heading. |

**Verdict:** Two real, shippable gaps. Everything else is already production-grade — proposing a rewrite would be busywork.

## Plan — fix the two real gaps

### 1. Image optimization across product/vendor/category surfaces

Add three universally-supported `<img>` attributes wherever product/vendor/category imagery renders. No new deps, no architecture change, measurable LCP/CLS win:

- `loading="lazy"` on every off-screen image (skip the homepage hero — that one stays eager)
- `decoding="async"` on all
- explicit `width` + `height` (or `aspect-ratio` via Tailwind class) to prevent layout shift

Files touched:
- `src/components/product/ProductCard.tsx` — main product tile (highest impact)
- `src/components/product/SponsoredProductCard.tsx` — same treatment
- `src/components/vendor/VendorCard.tsx` — vendor logo
- `src/components/home/KashmirCategories.tsx` — category tiles
- `src/components/reviews/ReviewImageGallery.tsx` — thumbnail grid

For the LCP image specifically (first hero in `HomePage.tsx`), set `loading="eager"` + `fetchpriority="high"` so we don't regress the above-the-fold paint.

### 2. "Recommended near {city}" homepage section

A small, region-personalized strip below `LocalDeals` that uses the existing `get_ranked_products` RPC filtered by the user's pincode via `vendor_serviceability` (already returned by `check_serviceability`). When no pincode is set, gracefully falls back to global trending — no broken state.

- Heading: *"Recommended for {city}"* (city from `LocationContext`); fallback *"Recommended for you"*
- Reuses existing `ProductGrid` component (no new card)
- Uses existing `useServiceability` hook to filter the ranked list to deliverable products only
- Skeleton loader during fetch (existing `SkeletonLoader`)
- Empty state: hide the entire section if zero serviceable items (don't show an empty band)

New component: `src/components/home/RegionRecommendations.tsx`. Inserted into `HomePage.tsx` between `LocalDeals` and the existing vendor showcase.

### 3. Document confirmed-shipped items

No code changes for these — verify in QA pass:
- Backend-driven categories/products/vendors (RLS-gated, role-aware)
- Route-level code splitting for `/admin/*` and `/vendor/*` chunks
- `LocationContext` → `LocalDeals` → `get_local_deals(_pincode)` data flow
- Mobile breakpoints across `Header`, `Footer`, `ProductCard`, sidebar Sheet

## Out of scope (intentional)

- Switching to a CDN image transformer (Cloudinary/imgix) — requires infra setup; current Supabase storage + canvas compression is sufficient for current scale
- Service worker / offline cache — premature
- Replacing React Query with SWR/Zustand — current stack is production-grade
- New recommendation algorithm — existing `get_ranked_products` already weights popularity + rating + recency + ad signal

## Files

**Edit**
- `src/components/product/ProductCard.tsx` — add `loading="lazy"`, `decoding="async"`, dimensions
- `src/components/product/SponsoredProductCard.tsx` — same
- `src/components/vendor/VendorCard.tsx` — same on logo
- `src/components/home/KashmirCategories.tsx` — same on category tiles
- `src/components/reviews/ReviewImageGallery.tsx` — same on thumbs
- `src/pages/HomePage.tsx` — eager+high-priority hero image; insert `<RegionRecommendations />` strip

**Create**
- `src/components/home/RegionRecommendations.tsx` — region-aware ranked products strip with city-aware heading, serviceability filter, skeleton, hide-when-empty
