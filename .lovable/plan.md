

## Extend Payment System with Razorpay

### Overview
Add Razorpay as an additional payment gateway alongside the existing UPI QR and simulated payment methods. The DB gets three new columns, the checkout UI gets a "Razorpay" option, and the payment service gets a Razorpay flow that loads the Razorpay checkout SDK client-side.

### 1. Database Migration

Add three columns to `payments` table:
```sql
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text;
```

No RLS changes needed — existing policies cover these columns.

### 2. Edge Function: `create-razorpay-order`

Create `supabase/functions/create-razorpay-order/index.ts`:
- Accepts `{ amount, currency, orderId }` from the frontend
- Uses `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` secrets to call Razorpay Orders API (`https://api.razorpay.com/v1/orders`)
- Returns the Razorpay order ID to the frontend
- Validates JWT in code for auth

**Requires secrets**: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` — will prompt user to add these.

### 3. Update `src/types/order.ts`

- Add `'razorpay'` to `paymentMethod` union in `Payment` interface
- Add `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature` optional fields

### 4. Update `src/services/paymentService.ts`

Add method `processRazorpayPayment()`:
1. Call edge function to create Razorpay order
2. Return the Razorpay order details so the frontend can open the Razorpay checkout modal
3. Add `confirmRazorpayPayment(paymentId, razorpayPaymentId, razorpayOrderId, razorpaySignature)` — updates the payment record with Razorpay details and sets status to `success`

Update `processPayment()`: when method is `'razorpay'`, create payment record with `payment_provider: 'razorpay'` and return Razorpay order info instead of simulating.

### 5. Update `src/pages/CheckoutPage.tsx`

- Add Razorpay to `PAYMENT_METHODS` array with a credit card icon variant
- Add `'razorpay_pending'` to `FlowState`
- Load Razorpay checkout.js script dynamically (`https://checkout.razorpay.com/v1/checkout.js`)
- When method is `razorpay`, after order creation, open `Razorpay` checkout modal with the order ID
- On success callback: call `confirmRazorpayPayment`, confirm stock, clear cart, show success
- On failure: release stock, show failure

### 6. Update `index.html`

No changes needed — Razorpay script loaded dynamically.

### Files
- **Migration**: Add 3 columns to `payments`
- **Create**: `supabase/functions/create-razorpay-order/index.ts`
- **Modify**: `src/types/order.ts`
- **Modify**: `src/services/paymentService.ts`
- **Modify**: `src/pages/CheckoutPage.tsx`

### Secrets Required
Will prompt user to add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` before implementing the edge function.

