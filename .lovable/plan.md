

## Product Ranking Algorithm — Implementation Plan

### Current State
- Products table has `rating`, `review_count`, `is_sponsored` but no `sales_count`, `view_count`, or ranking score columns
- Analytics events already track `product_view`, `ad_view`, `ad_click`, `purchase`
- Homepage sorts by `popularity` (review_count) and `newest`
- Search sorts client-side with no ranking score
- No trending section based on recent activity

### Plan

#### 1. Database Migration
Add columns to `products` table:
- `sales_count INTEGER NOT NULL DEFAULT 0`
- `view_count INTEGER NOT NULL DEFAULT 0`
- `trending_score NUMERIC DEFAULT 0`

Create a DB function `calculate_product_scores()` that for each product computes:
- `sales_count` from completed order_items
- `view_count` from analytics_events where event_type = 'product_view'
- `trending_score` based on recent (7-day) sales growth + recent views

Create a DB function `get_ranked_products(p_limit INT, p_category TEXT, p_search TEXT)` that returns products ordered by:
```
score = 0.35 * normalized_sales + 0.25 * (rating/5*100) + 0.20 * ad_boost + 0.20 * recency_factor
```
Where `ad_boost` = 100 if product has active approved campaign, else 0. `recency_factor` = based on created_at age decay.

Update existing triggers: add to `on_order_status_change` to increment `sales_count` when order moves to 'delivered'. Add a trigger on analytics_events insert to increment `view_count` when event_type = 'product_view'.

#### 2. Add `add_to_cart` Event Tracking
Update `CartContext.tsx` to fire `analyticsService.trackEvent('add_to_cart', productId)` when a product is added.

#### 3. Update Product Type & Service
- Add `salesCount`, `viewCount`, `trendingScore` to `Product` interface
- Add `mapDbProduct` mappings
- Add `getRanked()` and `getTrending()` methods to productService that call the DB functions
- Add 'ranked' sort option

#### 4. Update HomePage
- Change "Trending Now" to use `getTrending()` (products sorted by trending_score)
- Change "All Products" to use `getRanked()` (sorted by composite score)

#### 5. Update SearchPage
- When sort = 'relevance', use `getRanked()` with search/category params
- Sponsored products remain interspersed but organic results use ranking score

#### 6. Update ProductDetailPage
- Already tracks `product_view` — ensure `view_count` increments via trigger

### Files to Create/Modify
- **Migration**: Add columns, create `calculate_product_scores` + `get_ranked_products` functions, update triggers
- **Modify**: `src/types/product.ts` — add `salesCount`, `viewCount`, `trendingScore`
- **Modify**: `src/services/productService.ts` — add `getRanked`, `getTrending`, update `mapDbProduct`
- **Modify**: `src/contexts/CartContext.tsx` — track `add_to_cart` event
- **Modify**: `src/pages/HomePage.tsx` — use ranked/trending queries
- **Modify**: `src/pages/SearchPage.tsx` — use ranked query for relevance sort

