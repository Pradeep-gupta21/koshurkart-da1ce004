

## Finalize Payment System — Fix Critical Issues

After reviewing the full payment flow, I found several issues that need fixing to make the system production-ready.

### Issues Found

1. **Edge functions use `auth.getClaims()` which doesn't exist** in Supabase JS v2. Both `create-razorpay-order` and `verify-razorpay-payment` will fail at auth validation. Must use `auth.getUser()` instead.

2. **COD flow runs through simulated gateway** with a random 5% failure rate. COD should always succeed deterministically — no "gateway verification" needed.

3. **Database triggers may be missing**. The trigger metadata shows "no triggers" despite the migration existing. Need to verify and re-create all required triggers (payment success, shipping status, review notifications, etc.) in a single migration.

### Plan

#### 1. Fix Edge Function Auth — `verify-razorpay-payment/index.ts`
Replace `auth.getClaims(token)` with `auth.getUser()` which validates the JWT and returns user data.

#### 2. Fix Edge Function Auth — `create-razorpay-order/index.ts`
Same fix: replace `auth.getClaims(token)` with `auth.getUser()`.

#### 3. Fix COD Flow — `src/services/paymentService.ts`
In `processPayment`, handle COD before calling `verifyPayment`. COD should:
- Set payment status to `pending` (paid on delivery)
- Set order status to `confirmed`
- Return success immediately without simulated gateway

#### 4. Re-create All Database Triggers — Migration
Create a migration that ensures all triggers are properly attached:
- `trigger_on_payment_success` on `payments` (AFTER UPDATE)
- `trigger_on_shipping_status_change` on `orders` (BEFORE UPDATE)
- `trigger_on_shipping_notify_user` on `orders` (AFTER UPDATE)
- `trigger_on_order_status_change` on `orders` (AFTER UPDATE)
- `trigger_on_order_item_notify_vendor` on `order_items` (AFTER INSERT)
- `trigger_on_review_insert` on `reviews` (AFTER INSERT)
- `trigger_on_review_notify_vendor` on `reviews` (AFTER INSERT)
- `trigger_flag_suspicious_review` on `reviews` (BEFORE INSERT)
- `trigger_on_vendor_verified_notify` on `vendors` (AFTER UPDATE)
- `trigger_on_analytics_event_insert` on `analytics_events` (AFTER INSERT)
- `trigger_on_purchase_conversion` on `analytics_events` (AFTER INSERT)
- `trigger_products_search_vector` on `products` (BEFORE INSERT OR UPDATE)

Use `CREATE TRIGGER IF NOT EXISTS` pattern (DROP IF EXISTS + CREATE) for idempotency.

### Files
- **Modify**: `supabase/functions/verify-razorpay-payment/index.ts`
- **Modify**: `supabase/functions/create-razorpay-order/index.ts`
- **Modify**: `src/services/paymentService.ts`
- **Create**: New migration to ensure all triggers exist

