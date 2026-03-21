

## UPI QR Code Payment — Implementation Plan

### Overview
Add a UPI payment flow with QR code generation, payment instructions, optional screenshot upload, and a "pending_verification" status for manual confirmation.

### 1. Database Migration

Add new columns to `payments` table:
```sql
ALTER TABLE payments ADD COLUMN upi_id text DEFAULT NULL;
ALTER TABLE payments ADD COLUMN qr_code_url text DEFAULT NULL;
ALTER TABLE payments ADD COLUMN payment_proof text DEFAULT NULL;
```

Add `pending_verification` as a valid payment status (no enum constraint exists — it's a text column, so no schema change needed for the status value itself).

### 2. Update `src/types/order.ts`

Add to `Payment` interface:
- `upiId: string | null`
- `qrCodeUrl: string | null`
- `paymentProof: string | null`
- Add `'pending_verification'` to `paymentStatus` union type

### 3. Update `src/services/paymentService.ts`

- Update `createPayment` to accept optional `upiId` parameter and store it
- Update `processPayment`: when method is `'upi'`, skip automatic verification. Instead:
  - Create payment with status `pending`
  - Generate QR code URL (using a free QR API like `https://api.qrserver.com/v1/create-qr-code/` with UPI deep link format: `upi://pay?pa=MERCHANT_UPI&am=AMOUNT&tn=ORDER_ID`)
  - Update payment with `qr_code_url`
  - Return `{ success: false, awaitingUpi: true, payment, qrCodeUrl }` — a new response shape
- Add `confirmUpiPayment(paymentId, orderId, proofUrl?)` method:
  - Updates payment status to `pending_verification`
  - Optionally stores `payment_proof` URL
- Add `uploadPaymentProof(file)` — uploads to `product-images` bucket (reuse existing bucket) under a `payment-proofs/` prefix

### 4. Add merchant UPI ID to `src/config/platformSettings.ts`

```ts
merchantUpiId: 'merchant@upi', // Configure with real UPI ID
```

### 5. Update `src/pages/CheckoutPage.tsx`

When UPI is selected and order is placed:
- Instead of showing generic "Processing..." spinner, show a **UPI Payment screen**:
  - QR code image (from QR API)
  - Payment amount prominently displayed
  - UPI ID displayed for manual entry
  - Step-by-step instructions (scan QR / enter UPI ID in any UPI app)
  - Optional: file upload for payment screenshot
  - **"I Have Paid"** button → calls `confirmUpiPayment()`, sets status to `pending_verification`
  - Shows confirmation: "Payment submitted for verification"

New flow state: add `'upi_pending'` to `FlowState` type.

### Files to Create/Modify
- **Migration**: Add `upi_id`, `qr_code_url`, `payment_proof` columns to payments
- **Modify**: `src/types/order.ts` — add new fields + status
- **Modify**: `src/config/platformSettings.ts` — add `merchantUpiId`
- **Modify**: `src/services/paymentService.ts` — UPI-specific flow, confirm method, proof upload
- **Modify**: `src/pages/CheckoutPage.tsx` — UPI QR code screen with "I Have Paid" button

