

## AI-Enhanced Recommendation System — Implementation Plan

### Current State
- `recommendationService` has basic category-matching recommendations, similar products by category, and co-purchase "frequently bought together"
- `analyticsService.trackEvent()` already tracks `product_view`, `ad_click`, `add_to_cart`, `purchase` events
- HomePage shows "Recommended for You" (authenticated) and "Trending Now" sections
- ProductDetailPage shows "Similar Products" and "Frequently Bought Together"
- No weighted scoring model, no "Because you viewed" context

### Plan

#### 1. Create `src/services/aiRecommendationService.ts`

A modular scoring service with clear separation for future ML integration:

**Scoring Model:**
```
score = 0.4 * similarity + 0.3 * popularity + 0.2 * userBehavior + 0.1 * recency
```

**Functions:**
- `calculateProductScore(product, userProfile)` — computes composite score from the four signals
- `getUserBehaviorProfile(userId)` — fetches recent analytics events (views, cart adds, purchases) and builds a preference profile (category weights, tag weights, interaction counts)
- `getSmartRecommendations(userId, limit)` — fetches candidate products, scores and ranks them, returns top results
- `getBecauseYouViewed(userId, limit)` — finds recently viewed product categories/tags, returns similar unviewed products with contextual label (the viewed product title)
- `getPopularInCategory(category, limit)` — popularity-ranked products in a specific category (for "Popular in your area" / interest-based sections)

**Scoring details:**
- **Similarity** (0.4): category match weight + tag overlap (Jaccard-like) against user's preferred categories/tags
- **Popularity** (0.3): normalized `salesCount + viewCount + trendingScore`
- **User Behavior** (0.2): weighted interaction score — purchases (weight 4), cart adds (3), views (1) for matching categories
- **Recency** (0.1): decay based on product `createdAt` age (100 if < 7 days, decaying to 0 at 90 days)

Cache smart recommendations for 3 minutes per user.

#### 2. Update `src/pages/HomePage.tsx`

Replace the existing "Recommended for You" query with `aiRecommendationService.getSmartRecommendations()`.

Add new section: **"Because You Viewed [Product]"** — shows products related to the user's most recently viewed item, with the viewed product title as context. Only for authenticated users.

Rename existing trending subtitle or add a **"Popular in [Category]"** section based on user's most-interacted category.

#### 3. Update `src/pages/ProductDetailPage.tsx`

Replace `recommendationService.getSimilarProducts()` with `aiRecommendationService` scored similar products (still same category but ranked by composite score instead of just rating).

#### 4. Update exports in `src/services/index.ts`

### Files to Create/Modify
- **Create**: `src/services/aiRecommendationService.ts`
- **Modify**: `src/pages/HomePage.tsx` — use smart recommendations, add "Because you viewed" section
- **Modify**: `src/pages/ProductDetailPage.tsx` — use scored similar products
- **Modify**: `src/services/index.ts` — export aiRecommendationService

No database changes needed — all data already tracked via `analytics_events`.

