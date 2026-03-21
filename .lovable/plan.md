

## Full Payment Flow — Implementation Plan

### Current State
- `paymentService` already has `createPayment`, `updatePaymentStatus`, `getPaymentByOrder`, `getUserPayments`
- Checkout currently creates order + payment in one step, immediately setting `payment_status = 'success'` for non-COD methods
- No `verifyPayment()` method exists
- Order is created with default `payment_status = 'pending'` and `order_status = 'processing'` — but the checkout skips the pending state and jumps to success
- No payment failure handling or order status sync based on payment outcome

### What Needs to Change

#### 1. Update `paymentService.ts` — Add `verifyPayment()`

Add a `verifyPayment(paymentId, method)` function that simulates payment verification:
- For `cod`: returns `{ success: true, transactionId: null }` (stays pending until delivery)
- For all other methods: simulates a brief delay, then returns success with a generated transaction ID
- This is the extensibility point for future real payment gateway integration (Stripe, Razorpay, etc.)

Also add `processPayment(userId, orderId, amount, method)` — a higher-level orchestrator that:
1. Creates payment record with `status = 'pending'`
2. Calls `verifyPayment()` to simulate gateway
3. On success: updates payment to `success` + updates order `payment_status = 'paid'` and `order_status = 'confirmed'`
4. On failure: updates payment to `failed` + updates order `payment_status = 'failed'`
5. Returns `{ success, payment, error? }`

#### 2. Update `CheckoutPage.tsx` — Proper Flow

Replace the current single-step approach:
1. Create order with `payment_status = 'pending'`
2. Call `paymentService.processPayment()` which handles the full lifecycle
3. Show a "Processing payment..." state with a spinner
4. On success → show confirmation with transaction ID
5. On failure → show error, release inventory, allow retry
6. Only confirm stock and track analytics after payment success

#### 3. Update `orderService.ts` — Add `updateOrderStatus()`

Add a method to update `order_status` and `payment_status` on orders, used by the payment flow.

### Files to Modify
- **`src/services/paymentService.ts`** — add `verifyPayment()` and `processPayment()` orchestrator
- **`src/services/orderService.ts`** — add `updateOrderStatus()` helper
- **`src/pages/CheckoutPage.tsx`** — use `processPayment()`, add payment processing state, handle failure with retry

No database changes needed — existing `payments` and `orders` tables already have all required columns.

