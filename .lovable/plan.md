

## Advanced Search System — Implementation Plan

### Current State
- SearchPage has basic text search (ILIKE on title), category filter, and sort options
- Header has a simple search input that navigates to `/search?q=...`
- No autocomplete, no price/rating filters, no search history, no full-text search index
- `get_ranked_products` RPC does ILIKE on title only

### Plan

#### 1. Database Migration — Full-Text Search Index

Create a GIN index on products for full-text search across title, description, category, and tags:

```sql
-- Add a generated tsvector column for full-text search
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN (search_vector);
```

Create an RPC `search_products` that uses `ts_rank` for relevance scoring, supports price range and rating filters, and sorting options.

Create an RPC `get_search_suggestions` that returns distinct matching titles/categories for autocomplete.

#### 2. Create `src/services/searchService.ts`

- `searchProducts(query, filters, sort, limit)` — calls the `search_products` RPC with filters (category, priceMin, priceMax, minRating) and sort option
- `getSearchSuggestions(query)` — calls `get_search_suggestions` RPC for autocomplete (returns top 8 matches)
- `getSearchHistory()` — reads from localStorage
- `saveSearchQuery(query)` — saves to localStorage (keep last 10)
- `clearSearchHistory()` — clears localStorage
- `getTrendingSearches()` — queries analytics_events for most common product_view product titles

#### 3. Create `src/components/search/SearchBar.tsx`

Shared search bar component used in Header:
- Live suggestions dropdown (debounced, 300ms) showing autocomplete results
- Recent searches section (from localStorage)
- Trending searches section
- Click suggestion → navigate to `/search?q=...`
- Keyboard navigation support (arrow keys, enter, escape)

#### 4. Update Header (`Header.tsx`)

Replace the current inline search input with the new `SearchBar` component.

#### 5. Rebuild SearchPage (`SearchPage.tsx`)

- Use `searchService.searchProducts()` instead of `productService.getAll/getRanked`
- Add filter sidebar/panel with:
  - Category chips (existing, keep)
  - **Price range** — dual slider (min/max) using Slider component
  - **Rating filter** — minimum rating selector (star buttons)
- Sort options: relevance, price low/high, popularity, newest (existing, keep)
- Save search query to history on search
- Sponsored products at top (existing, keep)
- Show result count and active filters with clear buttons

### Files to Create/Modify
- **Migration**: search_vector column, GIN index, `search_products` RPC, `get_search_suggestions` RPC
- **Create**: `src/services/searchService.ts`
- **Create**: `src/components/search/SearchBar.tsx`
- **Modify**: `src/components/layout/Header.tsx` — use SearchBar
- **Modify**: `src/pages/SearchPage.tsx` — add price/rating filters, use searchService
- **Modify**: `src/services/index.ts` — export searchService

