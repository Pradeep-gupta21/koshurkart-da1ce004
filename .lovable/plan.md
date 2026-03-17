

## Real-Time Features — Implementation Plan

### Approach
Use Supabase Realtime (Postgres Changes) to subscribe to table changes. No polling needed — Supabase provides WebSocket-based realtime out of the box. We need to enable realtime on the relevant tables and add subscriptions in the UI components.

### 1. Database Migration — Enable Realtime

Add tables to the `supabase_realtime` publication:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suspicious_clicks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_events;
```

### 2. Create `src/hooks/useRealtimeSubscription.ts`

A reusable hook that wraps `supabase.channel().on('postgres_changes', ...).subscribe()`:
- Accepts table name, event type (INSERT/UPDATE/*), optional filter, and callback
- Returns cleanup on unmount
- Handles reconnection gracefully

### 3. Update Vendor Dashboard — Live Order Updates

**`VendorOverview.tsx`**:
- Subscribe to `order_items` INSERT where `vendor_id = vendorId` → auto-refresh recent orders and stats
- Show a toast notification when a new order arrives

**`VendorOrders.tsx`**:
- Subscribe to `orders` UPDATE → auto-refresh when order status changes
- Subscribe to `order_items` INSERT where `vendor_id = vendorId` → new orders appear live

### 4. Update User Profile — Real-Time Order Status

**`ProfilePage.tsx`**:
- Subscribe to `orders` UPDATE where `user_id = userId` → auto-refresh order list when shipping/order status changes

### 5. Update Admin Dashboard — Real-Time Fraud & Ad Updates

**`AdminOverview.tsx`**:
- Subscribe to `suspicious_clicks` INSERT → auto-refresh fraud alerts section
- Subscribe to `ad_campaigns` UPDATE → auto-refresh ad performance data
- Subscribe to `orders` INSERT → auto-refresh order count and revenue stats

### 6. Create `src/services/realtimeService.ts`

Utility service with helper functions:
- `subscribeToTable(table, event, filter, callback)` — returns channel for cleanup
- `unsubscribe(channel)` — removes subscription
- Event type constants for clarity

### Files to Create/Modify
- **Migration**: Enable realtime on orders, order_items, ad_campaigns, suspicious_clicks
- **Create**: `src/hooks/useRealtimeSubscription.ts`
- **Create**: `src/services/realtimeService.ts`
- **Modify**: `src/pages/vendor/VendorOverview.tsx` — add live order subscription
- **Modify**: `src/pages/vendor/VendorOrders.tsx` — add live order subscription
- **Modify**: `src/pages/ProfilePage.tsx` — add order status subscription
- **Modify**: `src/pages/admin/AdminOverview.tsx` — add fraud/ad/order subscriptions
- **Modify**: `src/services/index.ts` — export realtimeService

