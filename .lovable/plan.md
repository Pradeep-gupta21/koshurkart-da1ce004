

## Delivery & Logistics Tracking — Implementation Plan

### Approach
Add shipping columns directly to the `orders` table (simpler than a separate `shipments` table). Add a `shipment_events` table for delivery history timeline. This keeps things straightforward while supporting all requested features.

### 1. Database Migration

**Add columns to `orders`:**
- `shipping_provider TEXT DEFAULT NULL`
- `tracking_id TEXT DEFAULT NULL`
- `shipping_status TEXT DEFAULT 'pending'` (pending, shipped, in_transit, out_for_delivery, delivered)
- `estimated_delivery DATE DEFAULT NULL`
- `courier_api_config JSONB DEFAULT '{}'` (future external API integration)

**Create `shipment_events` table:**
- `id UUID PK`, `order_id UUID REFERENCES orders(id) ON DELETE CASCADE`, `status TEXT NOT NULL`, `description TEXT DEFAULT ''`, `location TEXT DEFAULT NULL`, `created_at TIMESTAMPTZ DEFAULT now()`

**Trigger:** On `orders` UPDATE, when `shipping_status` changes, auto-insert a `shipment_events` row. Also sync `order_status` (e.g. shipped/delivered) when shipping_status updates.

**RLS:**
- `shipment_events`: Users SELECT own order events; vendors SELECT their order events; admins full SELECT
- Vendors can UPDATE `shipping_provider`, `tracking_id`, `shipping_status`, `estimated_delivery` on orders (already have UPDATE policy)

### 2. Update Types (`src/types/order.ts`)
Add `shippingProvider`, `trackingId`, `shippingStatus`, `estimatedDelivery`, `courierApiConfig` to `Order`. Add `ShipmentEvent` interface.

### 3. Update Order Service (`src/services/orderService.ts`)
- `getShipmentEvents(orderId)` — fetch timeline
- `updateShipment(orderId, data)` — vendor updates tracking info

### 4. Update Vendor Orders (`VendorOrders.tsx`)
- Expand status flow: pending → shipped → in_transit → out_for_delivery → delivered
- Add editable fields per order: shipping provider (dropdown: FedEx/UPS/DHL/USPS/Other), tracking ID (text input), estimated delivery (date picker)
- Show current shipping status with step indicators

### 5. Update User Profile (`ProfilePage.tsx`)
- When order expanded, show delivery progress tracker (5-step indicator for shipping statuses)
- Show estimated delivery date
- Show tracking history timeline from `shipment_events` (fetched on expand)
- Show shipping provider + tracking ID

### 6. Admin Extensibility
The `courier_api_config` JSONB column on orders allows future integration with external courier APIs (webhook URLs, API key references, provider-specific config).

### Files to Create/Modify
- **Migration**: Add columns to orders, create `shipment_events`, trigger for auto-logging status changes
- **Modify**: `src/types/order.ts` — add shipping fields + ShipmentEvent
- **Modify**: `src/services/orderService.ts` — shipment queries
- **Modify**: `src/pages/vendor/VendorOrders.tsx` — shipment management UI
- **Modify**: `src/pages/ProfilePage.tsx` — delivery progress tracker + timeline

