

## Goal
Add Kashmiri storytelling to the homepage and add "From Kashmir" trust signaling on product cards & detail pages. Keep all existing data/queries intact — this is additive layout and badges.

## Changes

### 1. Homepage (`src/pages/HomePage.tsx`)
- **Hero copy tweak**: Update headline to *"Discover Kashmir's Finest Products"* with a subtler subhead and primary CTA *"Explore Now"* → `/search`. Keep current dusk gradient + paisley.
- **NEW: Kashmir Categories grid** (after hero, before LocalDeals). 5 curated tiles: Handicrafts · Pashmina Shawls · Dry Fruits · Saffron · Local Art. Each card: rounded-2xl, walnut border, soft shadow, gradient overlay, emoji/lucide icon + serif label, `hover:scale-[1.02]` zoom. Links to `/search?category=…`.
- **Deals → horizontal scroll**: Add a `LocalDealsScroller` variant that renders deals in `overflow-x-auto snap-x` strip with section title *"Today's Kashmiri Deals"*. Keep existing `LocalDeals` query/data; just swap layout when ≥4 items.
- **Featured Vendors polish**: Add small saffron *"From Kashmir"* badge under each vendor name. Heading → *"Artisans of the Valley"*.
- **NEW: Story section** (before "All Products"): Two-column band — left: serif title *"Handmade with Love in Kashmir"*, two short paragraphs about artisan partnership, CTA *"Meet Our Artisans"* → `/search`; right: paisley-pattern panel with `bg-dusk` and a soft saffron glow. Wood-tinted border, generous padding.

### 2. Product Card (`src/components/product/ProductCard.tsx`)
- Add a small *"From Kashmir"* badge (saffron pill with mountain icon) in the top-left, stacked under the SPONSORED badge if present. Shown for all products (this is a J&K-only marketplace).
- Slightly larger image area is already aspect-square — keep. Increase title to `line-clamp-2` and bump font to `text-sm font-semibold` for breathing room. No structural change.

### 3. Product Detail Page (`src/pages/ProductDetailPage.tsx`)
- **Trust badge row** under the price: three pill badges in a row — *"Authentic Kashmiri Product"* (saffron + Mountain icon), *"Verified Artisan"* (navy + ShieldCheck, only if `vendorTrust.is_verified`), *"Secure Delivery"* (green + Truck icon). Wraps responsively.
- **Vendor card**: Replace the inline single-line vendor row with a compact card above the title — avatar/initial, store name, *"From Kashmir"* badge, trust score chip, `View store` link. Keeps existing data, just better presented.
- Keep gallery, location-aware delivery (already there via `ServiceabilityBadge`), reviews, recs untouched.

### 4. Reusable bits
- New tiny component `src/components/product/FromKashmirBadge.tsx` — saffron pill, `Mountain` icon, `text-[10px] font-semibold` — used by ProductCard, vendor tiles, story section.

## Out of scope
- New routes/pages, new DB queries, image asset generation, animations beyond simple hover, i18n, wishlist.

## Files

**Create**
- `src/components/product/FromKashmirBadge.tsx`
- `src/components/home/KashmirCategories.tsx`
- `src/components/home/StorySection.tsx`

**Edit**
- `src/pages/HomePage.tsx` — hero copy/CTA, insert categories + story sections, vendor heading, "From Kashmir" badge on vendor tiles
- `src/components/home/LocalDeals.tsx` — switch to horizontal snap-scroll layout + new heading
- `src/components/product/ProductCard.tsx` — From Kashmir badge, title polish
- `src/pages/ProductDetailPage.tsx` — trust badge row, vendor card refactor

