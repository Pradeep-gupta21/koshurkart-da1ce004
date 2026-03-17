

## Product Recommendation Engine — Implementation Plan

### Current State
- Products already have `category` field; no `tags` column
- `analytics_events` tracks `product_view` events with `user_id` and `product_id`
- `order_items` tracks purchase history per user (via `orders.user_id`)
- `get_trending_products` RPC already exists
- ProductDetailPage has a basic "Similar Products" section (same category query)
- HomePage has Trending Now but no "Recommended for You" section
- No recommendation service exists

### Plan

#### 1. Database Migration
- Add `tags TEXT[] DEFAULT '{}'` column to `products` table
- No user-side table changes needed — recently viewed and purchase history can be derived from `analytics_events` and `order_items`

#### 2. Create `src/services/recommendationService.ts`

**`getPersonalizedRecommendations(userId, limit)`**
- Query `analytics_events` for user's recent `product_view` events → get viewed product IDs
- Query `order_items` via orders for user's purchased product IDs
- From those products, extract categories (and tags once populated)
- Fetch products matching those categories/tags, excluding already-viewed/purchased, ordered by trending_score
- Fallback to trending if no history

**`getSimilarProducts(productId, limit)`**
- Fetch the source product's category and tags
- Query products with same category OR overlapping tags, exclude source product
- Order by rating + sales_count

**`getFrequentlyBoughtTogether(productId, limit)`**
- Find orders containing this product via `order_items`
- Find other products in those same orders
- Return most frequently co-purchased products

**`getTrendingProducts(limit)`**
- Delegates to existing `productService.getTrending()`

#### 3. Update `src/types/product.ts`
- Add `tags?: string[]` to Product interface

#### 4. Update `src/services/productService.ts`
- Map `tags` field from DB in `mapDbProduct`

#### 5. Update `src/pages/HomePage.tsx`
- Add "Recommended for You" section (between Sponsored and Trending)
- If user logged in → `getPersonalizedRecommendations(userId)`
- If guest → show trending (already there, skip this section)

#### 6. Update `src/pages/ProductDetailPage.tsx`
- Replace basic similar products query with `recommendationService.getSimilarProducts()`
- Add "Frequently Bought Together" section using `getFrequentlyBoughtTogether()`

#### 7. Update exports
- Add `recommendationService` to `src/services/index.ts`

### Files to Create/Modify
- **Migration**: Add `tags` column to products
- **Create**: `src/services/recommendationService.ts`
- **Modify**: `src/types/product.ts` — add tags
- **Modify**: `src/services/productService.ts` — map tags
- **Modify**: `src/pages/HomePage.tsx` — add Recommended for You section
- **Modify**: `src/pages/ProductDetailPage.tsx` — improved similar + frequently bought together
- **Modify**: `src/services/index.ts` — export

