# Koshur Kart — Feature Architecture Audit

Read-only audit. No code changes proposed or required.

## Summary Table

| # | Feature Area | Status |
|---|---|---|
| 1 | Recommendation Systems | Implemented & Working |
| 2 | Product Discovery Systems | Implemented & Working |
| 3 | Personalization Systems | Implemented & Working |
| 4 | Analytics Tracking | Implemented & Working |
| 5 | User Behavior Tracking | Implemented & Working |
| 6 | Homepage Recommendation Sections | Implemented & Working |
| 7 | Product Page Recommendation Sections | Implemented & Working |
| 8 | Vendor Recommendation Systems | Partially Implemented |
| 9 | Search & Filtering Capabilities | Implemented & Working |
| 10 | Wishlist Functionality | Not Implemented |
| 11 | Recently Viewed Functionality | Not Implemented |
| 12 | Trending / Popular Product Logic | Implemented & Working |

---

## 1. Recommendation Systems — Implemented & Working
Two parallel engines:
- **Rule-based** `src/services/recommendationService.ts` → `getPersonalizedRecommendations`, `getSimilarProducts`, `getFrequentlyBoughtTogether` (co-purchase mining over `order_items`).
- **Composite scoring** `src/services/aiRecommendationService.ts` → `getSmartRecommendations` (Similarity 40% + Popularity 30% + Behavior 20% + Recency 10%), `getBecauseYouViewed`, `getPopularInCategory`, `getScoredSimilarProducts`.

**Tables:** `analytics_events`, `products` (category, tags, sales_count, view_count, trending_score, rating), `orders`, `order_items`
**Frontend:** consumed by HomePage, ProductDetailPage
**Edge functions:** none (logic runs client-side via supabase-js)
**API calls:** direct table SELECTs + RPCs (`get_trending_products`)

## 2. Product Discovery Systems — Implemented & Working
- `get_ranked_products` SQL RPC: 35% sales, 25% rating, 20% ad boost, 20% recency + locality boost on `vendor.pickup_state`.
- `search_products` SQL RPC: full-text + filters + locality boost.

**Tables:** `products`, `vendors`, `ad_campaigns`
**Frontend:** `HomePage.tsx`, `SearchPage.tsx`, `RegionRecommendations.tsx`
**Services:** `productService.getRanked`, `searchService.searchProducts`
**RPCs:** `get_ranked_products`, `search_products`

## 3. Personalization Systems — Implemented & Working
- `getUserBehaviorProfile` aggregates 200 latest events; weights purchase ×4, add_to_cart ×3, view ×1.
- Locality personalization via `LocationContext` (`userState`, pincode) flows into ranked + search RPCs.
- Pincode serviceability filter via `useServiceability`.
- Personalized homepage sections gated on `!!user?.id`; anonymous → trending fallback.
- No server-side ML — deterministic TS/SQL scoring.

**Tables:** `analytics_events`, `products`, `orders`, `order_items`, `user_locations`, `vendor_serviceability`
**Services:** `aiRecommendationService`, `locationService`
**Frontend:** `HomePage.tsx`, `RegionRecommendations.tsx`, `LocalDeals.tsx`

## 4. Analytics Tracking — Implemented & Working
- `analytics_events` table (event_type, user_id, product_id, campaign_id, metadata, created_at); RLS allows anon/authenticated INSERT; only product vendor can SELECT own events.
- Ingestion via `record_analytics_event` security-definer RPC (`analyticsService.trackEvent`).
- AFTER INSERT trigger `trg_analytics_event_insert` → increments `products.view_count`.
- Vendor dashboard `VendorAnalytics.tsx` (time-series charts).
- Admin dashboard `AdminOverview.tsx` (revenue, growth, suspicious clicks).

**Tables:** `analytics_events`, `suspicious_clicks`, `products`, `orders`, `order_items`, `ad_campaigns`
**Services:** `analyticsService` (`getVendorAnalytics`, `getVendorChartData`)
**RPCs:** `record_analytics_event`

## 5. User Behavior Tracking — Implemented & Working
| Signal | Source | Storage |
|---|---|---|
| product_view | `ProductDetailPage.tsx:114` | analytics_events (+ view_count trigger) |
| add_to_cart | `CartContext.tsx:66` | analytics_events |
| purchase | `CheckoutPage.tsx:173/276/319` | analytics_events |
| ad_view / ad_click | `adService` | analytics_events (+ suspicious_clicks) |
| search query | `SearchPage` → `searchService.saveSearchQuery` | **localStorage only — not in DB** |

**Gap:** search queries not persisted server-side; unavailable for personalization or analytics.

## 6. Homepage Recommendation Sections — Implemented & Working
Sections rendered in `src/pages/HomePage.tsx`:
1. Sponsored / Auction Winners (`adService.getAuctionWinners('homepage', 4)`)
2. "For You" — `aiRecommendationService.getSmartRecommendations` (auth only)
3. "Because You Viewed…" — `getBecauseYouViewed` (auth only, hidden if no history)
4. Trending — `productService.getTrending` → `get_trending_products` RPC
5. Local Deals — `LocalDeals.tsx` → `locationService.getLocalDeals`
6. Region Recommendations — `RegionRecommendations.tsx` (ranked + pincode-filtered)
7. Kashmir Categories — `KashmirCategories.tsx` (static tiles)
8. Story Section — `StorySection.tsx`
9. Featured Vendors — `productService.getVendors` (top 6 by total_sales)
10. All Products — `productService.getRanked({ limit: 16, userState })`

## 7. Product Page Recommendation Sections — Implemented & Working
`src/pages/ProductDetailPage.tsx`:
- Sponsored Suggestions — `adService.getApprovedByPlacement('product')`
- Frequently Bought Together — `recommendationService.getFrequentlyBoughtTogether` (line 152)
- Similar Products — `aiRecommendationService.getScoredSimilarProducts` (line 145)
- Tracks `product_view` on mount (line 114)

## 8. Vendor Recommendation Systems — Partially Implemented
**Present:** `productService.getVendors()` — top 6 approved vendors ordered by `total_sales DESC`, rendered as "Featured Vendors" strip in `HomePage.tsx:217`. Vendor info joined into product queries.

**Missing:**
- No personalized vendor recommendations (no "Vendors you may like" based on category preference or purchase history).
- No "New Vendors" / "Top vendors in your state" sections.
- No dedicated `vendorService` recommendation methods (existing `vendorService.ts` is order/fulfillment only).
- Sort is purely `total_sales DESC`.

**Tables:** `vendors` (total_sales, rating, trust_score, verification_status, pickup_state)

## 9. Search & Filtering — Implemented & Working
- Backend RPC `search_products` (full-text + category + price range + min rating + 6 sort options + locality boost).
- Autocomplete RPC `get_search_suggestions` (8 results, 2-char min).
- Frontend `SearchPage.tsx`: chips, price slider, rating selector, sort dropdown, active-filter badge.
- Post-query pincode serviceability filter + deliverable-first sort.
- Search history in localStorage (10 max).

**Tables:** `products`, `vendors`
**Services:** `searchService`
**Frontend:** `SearchPage.tsx`, `components/search/SearchBar.tsx`

## 10. Wishlist Functionality — Not Implemented
- No `wishlists` / `favorites` / `saved_items` table in any migration.
- No service, hook, context, component, route, or UI affordance (no heart button on `ProductCard` / `ProductDetailPage`).
- `rg "wishlist|favorites"` returns zero matches.

## 11. Recently Viewed Functionality — Not Implemented
- No table, service, or component dedicated to "Recently Viewed".
- The raw data **exists** in `analytics_events` (event_type=`product_view` per user) and is consumed indirectly by `getBecauseYouViewed`, but there is no user-facing "Recently Viewed" strip on Home, Product, or Profile pages.

## 12. Trending / Popular Product Logic — Implemented & Working
- `products.trending_score` column.
- `calculate_product_scores()` SQL function (7-day window: purchases ×3 + carts ×2 + views ×1).
- Real-time triggers: `trg_analytics_event_insert` (view_count++), `on_order_status_change` (sales_count++ when delivered).
- `get_trending_products` RPC sorts by trending_score, sales_count, view_count.
- Used directly on Home and as fallback in both recommendation services.

**Gap:** No cron / scheduled job invokes `calculate_product_scores()`; `trending_score` will drift stale unless triggered externally or via `recalculate-prices` edge function.

---

## Cross-Cutting Notes
- **Caching:** `cacheService` (TTLs ~3–5 min) wraps trending, similar, FBT, search; user-personalized AI recs cached 3 min, rule-based personalized recs uncached.
- **Anonymous users** always fall back to trending.
- **No server-side ML model** — all "AI" is weighted-sum arithmetic.
- **Three notable gaps:** Wishlist (full feature), Recently Viewed (frontend surfacing only), Vendor personalization (logic only).
- **Search history** is device-local only.
- **trending_score freshness** depends on an external scheduler.

---

This is a report only — no implementation will follow unless you request specific gaps be addressed.
