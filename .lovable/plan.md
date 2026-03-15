

## Cart, Checkout & Order Management — Implementation Plan

### Current State
- **CartContext** exists with add/remove/update/clear — works but no localStorage persistence
- **CartPage** has full UI with quantity controls and summary
- **CheckoutPage** has shipping + payment forms but does NOT create an order in the database — just clears cart and shows confirmation
- **orderService** has `create`, `addItems`, `getUserOrders`, `getVendorOrderItems` — ready to use
- **ProfilePage** shows order history (basic list of orders, no items shown)
- **VendorOverview** shows recent order items for the vendor
- No dedicated vendor orders page with status filtering
- No user order detail / tracking page

### Plan

#### 1. Add localStorage persistence to CartContext
- Initialize `items` from `localStorage` on mount
- Sync `items` to `localStorage` on every change via `useEffect`

#### 2. Wire CheckoutPage to create real orders
- On "Place Order": call `orderService.create()` then `orderService.addItems()` with product/vendor IDs from cart
- Require authentication (already wrapped in `ProtectedRoute`)
- Show order ID in confirmation screen
- Add Zod validation for shipping form fields

#### 3. Enhance ProfilePage with order details
- Fetch orders with `order_items` joined (use `orderService.getUserOrders`)
- Show expandable order rows with item list, images, quantities
- Show order status and payment status with colored badges
- Add link to individual order detail

#### 4. Create vendor orders page (`/vendor/orders`)
- New `VendorOrders.tsx` page with tabs: All / Processing / Shipped / Delivered
- Query `order_items` joined with `orders` for the vendor's items
- Show order status, customer info (order ID), item details
- Add status update buttons (processing → shipped → delivered)
- Requires an RLS policy allowing vendors to read orders that contain their items
- Requires UPDATE policy on orders for vendors (to change order_status)

#### 5. Database changes
- Add RLS policy: vendors can SELECT orders that have order_items with their vendor_id
- Add RLS policy: vendors can UPDATE order_status on orders containing their items
- Add "orders" nav item to VendorDashboard sidebar

### Files to Create/Modify
- **Modify**: `src/contexts/CartContext.tsx` — localStorage persistence
- **Modify**: `src/pages/CheckoutPage.tsx` — real order creation via orderService
- **Modify**: `src/pages/ProfilePage.tsx` — expanded order history with items
- **Create**: `src/pages/vendor/VendorOrders.tsx` — vendor order management with status tabs
- **Modify**: `src/pages/vendor/VendorDashboard.tsx` — add Orders nav item
- **Modify**: `src/App.tsx` — add `/vendor/orders` route
- **Migration**: RLS policies for vendor order access + update

