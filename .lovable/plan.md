

## Inventory Management System — Implementation Plan

### Current State
- Products table has `stock` but no `reserved_stock` or `low_stock_threshold` columns
- Checkout directly creates orders without any stock validation or reservation
- Vendor dashboard shows stock count but no reserved/available breakdown
- Admin overview shows product count but no inventory health monitoring

### Plan

#### 1. Database Migration
Add two columns to `products` table:
- `reserved_stock INTEGER NOT NULL DEFAULT 0`
- `low_stock_threshold INTEGER NOT NULL DEFAULT 5`

Create three security-definer DB functions for atomic stock operations:
- `reserve_stock(p_product_id UUID, p_quantity INT)` — validates `stock - reserved_stock >= quantity`, then increments `reserved_stock`. Raises exception if insufficient.
- `confirm_stock(p_product_id UUID, p_quantity INT)` — decrements both `stock` and `reserved_stock` by quantity (called on payment success).
- `release_stock(p_product_id UUID, p_quantity INT)` — decrements `reserved_stock` (called on payment failure/timeout).

These must be atomic DB functions (not client-side updates) to prevent race conditions.

#### 2. Create `src/services/inventoryService.ts`
Thin wrapper calling the three RPCs:
- `reserveStock(productId, quantity)` → calls `reserve_stock` RPC
- `confirmStock(productId, quantity)` → calls `confirm_stock` RPC
- `releaseStock(productId, quantity)` → calls `release_stock` RPC
- `checkAvailability(productId, quantity)` → queries product and checks `stock - reserved_stock >= quantity`

#### 3. Update Checkout Flow (`CheckoutPage.tsx`)
1. On "Place Order" click, first call `reserveStock` for each cart item
2. If reservation fails (insufficient stock), show error toast and abort
3. On successful order creation, call `confirmStock` for each item
4. On failure, call `releaseStock` for each reserved item
5. Add a 10-minute timeout — if user abandons, reserved stock auto-releases (via a simple cleanup: set `reserved_stock` to 0 for reservations older than 10 min, handled by a periodic DB function or on next checkout attempt)

#### 4. Update Product Card / Detail Page
- Show "Out of Stock" badge when `stock - reserved_stock <= 0`
- Disable "Add to Cart" button when out of stock
- Show "Low Stock" warning when available stock ≤ `low_stock_threshold`

#### 5. Update Vendor Dashboard
**VendorProducts.tsx**: Add columns/info for each product:
- Total Stock | Reserved | Available (`stock - reserved_stock`)
- Low stock alert badge (amber) when available ≤ threshold
- Add `lowStockThreshold` field to product create/edit form

**VendorOverview.tsx**: Add a "Low Stock Alerts" card listing products below threshold

#### 6. Update Admin Overview (`AdminOverview.tsx`)
Add an "Inventory Health" section:
- Total low-stock products across all vendors
- List of products with available stock ≤ threshold (product name, vendor, available stock)

#### 7. Update Product Type (`src/types/product.ts`)
Add `reservedStock` and `lowStockThreshold` to the `Product` interface.
Update `mapDbProduct` in `productService.ts` to map the new columns.

### Files to Create/Modify
- **Migration**: Add columns + create 3 RPC functions + cleanup function
- **Create**: `src/services/inventoryService.ts`
- **Modify**: `src/types/product.ts` — add fields
- **Modify**: `src/services/productService.ts` — map new fields
- **Modify**: `src/pages/CheckoutPage.tsx` — reservation flow
- **Modify**: `src/components/product/ProductCard.tsx` — out-of-stock/low-stock UI
- **Modify**: `src/pages/ProductDetailPage.tsx` — stock availability display
- **Modify**: `src/pages/vendor/VendorProducts.tsx` — stock breakdown + threshold field
- **Modify**: `src/pages/vendor/VendorOverview.tsx` — low stock alerts card
- **Modify**: `src/pages/admin/AdminOverview.tsx` — inventory health section

