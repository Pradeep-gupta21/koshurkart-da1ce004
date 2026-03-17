

## Caching Layer — Implementation Plan

### Approach
Create an in-memory cache with TTL support (Map-based, Redis-like semantics) and integrate it into the existing service layer.

### 1. Create `src/services/cacheService.ts`

In-memory cache using a `Map<string, { data: any; expiresAt: number }>`:

- `get<T>(key: string): T | null` — returns data if not expired, else deletes and returns null
- `set(key: string, data: any, ttlSeconds: number)` — stores with expiry timestamp
- `invalidate(key: string)` — deletes single key
- `invalidatePattern(prefix: string)` — deletes all keys starting with prefix
- `clear()` — flush all

Constants for TTLs:
- `HOMEPAGE_TTL = 300` (5 min)
- `PRODUCT_DETAIL_TTL = 600` (10 min)
- `SEARCH_TTL = 120` (2 min)
- `TRENDING_TTL = 300` (5 min)

### 2. Integrate into `productService.ts`

Wrap these methods with cache checks:
- `getAll()` (homepage products) — cache key: `products:all:{serialized options}`, TTL 5 min
- `getById(id)` — cache key: `product:{id}`, TTL 10 min
- `getTrending()` — cache key: `products:trending`, TTL 5 min
- On product create/update/delete → `invalidatePattern('product')` to clear related caches

### 3. Integrate into `searchService.ts`

- `searchProducts()` — cache key: `search:{query}:{filters}:{sort}`, TTL 2 min
- `getSearchSuggestions()` — cache key: `suggestions:{query}`, TTL 2 min

### 4. Integrate into `recommendationService.ts`

- `getTrendingProducts()` — delegates to productService (already cached)
- `getSimilarProducts(productId)` — cache key: `similar:{productId}`, TTL 5 min
- `getFrequentlyBoughtTogether(productId)` — cache key: `fbt:{productId}`, TTL 5 min
- Personalized recommendations are user-specific and change frequently — no caching

### 5. Export from `src/services/index.ts`

### Files
- **Create**: `src/services/cacheService.ts`
- **Modify**: `src/services/productService.ts` — add cache get/set around DB calls
- **Modify**: `src/services/searchService.ts` — add cache for search/suggestions
- **Modify**: `src/services/recommendationService.ts` — cache similar/FBT
- **Modify**: `src/services/index.ts` — export cacheService

No database changes needed.

