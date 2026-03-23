

## Create Razorpay Payment Verification Edge Function

### Problem
Currently, payment confirmation happens client-side — the frontend directly updates the payment status after the Razorpay popup succeeds. This is insecure because a malicious client could fake a successful payment without actually paying.

### Solution
Create a `verify-razorpay-payment` edge function that performs server-side HMAC-SHA256 signature verification using `RAZORPAY_KEY_SECRET`, then updates the payment and order records only if verification passes. Update the frontend to call this function instead of doing client-side updates.

### 1. Edge Function: `supabase/functions/verify-razorpay-payment/index.ts`

- Receive `{ razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentId, orderId }` from authenticated user
- Verify signature: `HMAC-SHA256(razorpayOrderId + "|" + razorpayPaymentId, RAZORPAY_KEY_SECRET)` must equal `razorpaySignature`
- On success: update `payments` record (status → success, store Razorpay IDs) and `orders` record (payment_status → paid, order_status → confirmed)
- On failure: return 400 error
- Uses service role key for DB updates to bypass RLS

### 2. Update `src/services/paymentService.ts`

Replace `confirmRazorpayPayment` to call the new edge function instead of directly updating the database client-side.

### 3. No checkout UI changes needed

The `CheckoutPage.tsx` already calls `confirmRazorpayPayment` — only the implementation changes.

### Files
- **Create**: `supabase/functions/verify-razorpay-payment/index.ts`
- **Modify**: `src/services/paymentService.ts`

