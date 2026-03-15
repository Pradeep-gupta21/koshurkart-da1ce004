

## Product Management System — Implementation Plan

### Current State
- **HomePage, SearchPage, ProductDetailPage** all use `mockProducts` from `mock-data.ts` — not connected to the database
- **VendorProducts** already has full CRUD (create/edit/delete) connected to the database, but uses inline Supabase calls and no image upload
- **productService.ts** exists with `getAll`, `getBySlug`, `getByVendor`, `create`, `update`, `remove` — but no pages use it yet
- **Database** has a `products` table with all needed fields except `status` (currently no status column)
- No image upload storage bucket exists

### Plan

#### 1. Database: Add `status` column to products
Migration to add `status text NOT NULL DEFAULT 'active'` to the products table. Values: `active`, `draft`, `archived`.

#### 2. Storage: Create product-images bucket
Migration to create a public `product-images` storage bucket with RLS policies allowing vendors to upload images for their products.

#### 3. Enhance productService.ts
Add sorting support (`price-low`, `price-high`, `rating`, `newest`), `status` filtering, and a `getCategories` helper. Update `getAll` to join vendor `store_name`.

#### 4. Rewrite VendorProducts to use productService + image upload
- Replace inline Supabase calls with `productService`
- Add Zod validation using existing `productSchema`
- Add drag-and-drop or file-input image upload to the product-images bucket
- Show product status toggle (active/draft/archived)
- Add per-product analytics summary (views, orders) — placeholder stats from order_items count

#### 5. Connect HomePage to database
- Replace `mockProducts` with `productService.getAll()` using React Query
- Fetch sponsored products (`is_sponsored = true`), trending (by `review_count` desc), and latest
- Fetch vendors from database instead of `mockVendors`
- Show skeleton loaders during loading

#### 6. Connect SearchPage to database
- Replace `mockProducts` with `productService.getAll()` using React Query
- Pass `category`, `search`, `sort` params to the service
- Add price range filter
- Add "popularity" sort (by `review_count`)

#### 7. Connect ProductDetailPage to database
- Fetch product by slug via `productService.getBySlug()`
- Fetch reviews from `reviews` table
- Fetch similar products by category
- Show loading skeleton while fetching

#### 8. Add product analytics to VendorAnalytics
- Query `order_items` grouped by `product_id` for the vendor's products
- Show top-selling products, total revenue, stock levels

### Files to Create/Modify
- **Migration**: add `status` column, create `product-images` bucket + RLS
- **Modify**: `src/services/productService.ts` — add sorting, status filter
- **Modify**: `src/pages/vendor/VendorProducts.tsx` — image upload, validation, status management
- **Modify**: `src/pages/HomePage.tsx` — database queries via React Query
- **Modify**: `src/pages/SearchPage.tsx` — database queries with filters/sorting
- **Modify**: `src/pages/ProductDetailPage.tsx` — database queries
- **Modify**: `src/pages/vendor/VendorAnalytics.tsx` — product analytics from order_items
- **Modify**: `src/lib/validators/productSchema.ts` — add status field

