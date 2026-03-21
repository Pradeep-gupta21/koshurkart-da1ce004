

## Payment Model — Implementation Plan

### Overview
Create a `payments` table to track individual payment transactions linked to orders and users, with future-ready commission fields. Update checkout flow to record payments and display payment info in user/vendor/admin views.

### 1. Database Migration

**Create `payments` table:**
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'card',  -- upi, card, netbanking, wallet, cod
  payment_provider TEXT DEFAULT NULL,
  transaction_id TEXT DEFAULT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',  -- pending, success, failed, refunded
  platform_commission NUMERIC DEFAULT 0,
  commission_percentage NUMERIC DEFAULT 10,
  vendor_earnings NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS policies:**
- Users SELECT own payments (`user_id = auth.uid()`)
- Users INSERT own payments (`user_id = auth.uid()`)
- Vendors SELECT payments for their orders (via order_items join)
- Admins SELECT all, UPDATE all (for status changes/refunds)

### 2. Update Payment Service (`src/services/paymentService.ts`)

Add methods:
- `createPayment(userId, orderId, amount, method, provider?)` — inserts a payment record
- `getPaymentByOrder(orderId)` — fetch payment for an order
- `getUserPayments(userId)` — fetch user's payment history
- `updatePaymentStatus(paymentId, status, transactionId?)` — admin/system updates

Keep existing payout methods unchanged.

### 3. Update Checkout Flow (`CheckoutPage.tsx`)

- Add payment method selector (UPI, Card, Net Banking, Wallet, COD)
- After order creation, create a payment record via `paymentService.createPayment()`
- For now, auto-set status to `success` (simulated); COD stays `pending`
- Show selected payment method on order confirmation

### 4. Update Types (`src/types/order.ts`)

Add `Payment` interface with all fields. Export from `src/types/index.ts`.

### 5. Update User Profile (`ProfilePage.tsx`)

Show payment method and status on each order in the order history.

### Files to Create/Modify
- **Migration**: Create `payments` table with RLS
- **Modify**: `src/services/paymentService.ts` — add payment CRUD methods
- **Modify**: `src/types/order.ts` — add Payment interface
- **Modify**: `src/types/index.ts` — export Payment
- **Modify**: `src/pages/CheckoutPage.tsx` — payment method selector + record payment
- **Modify**: `src/pages/ProfilePage.tsx` — show payment info on orders

