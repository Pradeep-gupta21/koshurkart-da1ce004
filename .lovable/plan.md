

## Event-Driven Notification System — Implementation Plan

### Current State
- `analytics_events` table already tracks events (product_view, ad_click, purchase) but has no notification layer
- No `notifications` table or in-app notification UI exists
- No notification service or bell icon in the header
- Vendor dashboard sidebar has no notifications link
- Profile page has no notification panel

### Plan

#### 1. Database Migration

**Create `notifications` table:**
- `id UUID PK`, `user_id UUID NOT NULL`, `type TEXT NOT NULL`, `title TEXT`, `message TEXT`, `entity_id UUID DEFAULT NULL`, `metadata JSONB DEFAULT '{}'`, `is_read BOOLEAN DEFAULT false`, `created_at TIMESTAMPTZ DEFAULT now()`

**RLS policies:**
- Users SELECT/UPDATE own notifications (`user_id = auth.uid()`)
- INSERT only via security definer functions (triggers)

**Enable realtime** on notifications table for live updates.

**Create `create_notification()` security definer function** that inserts into `notifications` — called by triggers.

**Create triggers to auto-generate notifications:**
- `on_order_placed`: When order inserted → notify each vendor (via distinct vendor_id in order_items) with "New order received"
- `on_shipping_status_shipped`: When `shipping_status` changes to `shipped` → notify the order's `user_id` with "Your order has been shipped"
- `on_shipping_status_delivered`: When `shipping_status` = `delivered` → notify user "Your order has been delivered"
- `on_vendor_verified`: When vendor `verification_status` changes to `approved` → notify vendor's `user_id`
- `on_review_submitted`: When review inserted → notify vendor (via product → vendor_id) "New review on your product"

Note: `order_placed` already triggers inventory reservation via checkout flow and analytics via existing events — no duplication needed. `ad_clicked` already updates campaign analytics via `track_ad_event` — just add a notification-aware analytics event if needed (skip notification for ad clicks as it would be noisy).

#### 2. Create Notification Service (`src/services/notificationService.ts`)
- `getUserNotifications(userId, limit)` — fetch notifications ordered by created_at desc
- `markAsRead(notificationId)` — update is_read
- `markAllAsRead(userId)` — update all unread for user
- `getUnreadCount(userId)` — count unread
- `subscribeToNotifications(userId, callback)` — realtime subscription

#### 3. Create NotificationBell Component (`src/components/notifications/NotificationBell.tsx`)
- Bell icon with unread count badge
- Dropdown/popover showing recent notifications
- Mark as read on click
- "Mark all as read" button
- Link to view all (or inline scroll)
- Uses realtime subscription for live count updates

#### 4. Update Header (`src/components/layout/Header.tsx`)
- Add NotificationBell next to cart icon (only shown when authenticated)

#### 5. Create Notification Panel for Vendor Dashboard
- Add a notifications page at `/vendor/notifications` or embed a panel in VendorOverview
- Show vendor-specific notifications (new orders, reviews, verification status)
- Add nav item to VendorDashboard sidebar

#### 6. Add Notification Panel to User Profile (`ProfilePage.tsx`)
- Add a "Notifications" section showing recent notifications with read/unread state

### Supported Event Types (mapped to notification triggers)
| Event | Recipient | Trigger Source |
|---|---|---|
| `order_placed` | Vendor(s) | INSERT on orders |
| `order_shipped` | User | UPDATE orders.shipping_status → 'shipped' |
| `order_delivered` | User | UPDATE orders.shipping_status → 'delivered' |
| `vendor_verified` | Vendor user | UPDATE vendors.verification_status → 'approved' |
| `review_submitted` | Vendor user | INSERT on reviews |

`product_viewed` and `ad_clicked` are already tracked via analytics_events and don't need in-app notifications (too noisy).

### Files to Create/Modify
- **Migration**: `notifications` table, `create_notification()` function, triggers
- **Create**: `src/services/notificationService.ts`
- **Create**: `src/components/notifications/NotificationBell.tsx`
- **Modify**: `src/components/layout/Header.tsx` — add bell icon
- **Modify**: `src/pages/vendor/VendorDashboard.tsx` — add notifications nav
- **Modify**: `src/pages/vendor/VendorOverview.tsx` — show recent notifications
- **Modify**: `src/pages/ProfilePage.tsx` — add notifications section
- **Modify**: `src/services/index.ts` — export notification service
- **Modify**: `src/types/index.ts` — export Notification type

