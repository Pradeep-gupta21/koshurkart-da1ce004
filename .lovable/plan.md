## Goal
Give shoppers a dedicated page to track their UPI/Razorpay/COD payment status, see admin verification results, and retry any failed or rejected payment.

## New route
- `/payments` — list of the current user's payments (latest first), grouped by status
- `/payments/:paymentId` — single payment detail with verification result + retry actions

Both protected by `ProtectedRoute` and lazy-loaded in `src/App.tsx`.

## UI

### PaymentsListPage
- Table/card list of `payments` for `auth.uid()` (RLS already permits `Users read own payments`)
- Columns: Order ID (short), Date, Method (UPI/Razorpay/COD), Amount (₹), Status badge, Action
- Status badges: `success` (green), `pending` (amber), `pending_verification` (blue "Awaiting admin review"), `failed`/`rejected` (red)
- Tabs/filter: All · Awaiting verification · Failed · Successful
- Empty state when no payments

### PaymentDetailPage (`/payments/:id`)
Sections:
1. **Header** — amount, method, status badge, created date
2. **Verification result panel** (UPI only):
   - `pending` → "Submit your UPI reference to complete payment" + link back to checkout flow
   - `pending_verification` → "Your payment is being verified by our team" + show submitted proof (`payment_proof`) and `transaction_id`
   - `success` → green check, `credited_at`, transaction id
   - `failed`/`rejected` → red banner with reason from `payment_audit_log` (latest entry where `new_status` matches) + **Retry** button
3. **Order summary** — fetched from `orders` + `order_items` (joined, RLS already allows owner)
4. **Audit timeline** — only show transitions visible to user (derived from `payment_status` changes; we don't have user read on `payment_audit_log`, so derive from current state + `created_at`/`credited_at`/`reversed_at` columns instead)
5. **Actions**
   - Retry payment (failed/rejected only): calls `paymentService.createOrUpdatePayment` reusing the same `orderId` (the service already handles re-using existing pending rows). Navigates user back to a lightweight retry flow that re-renders the QR / Razorpay modal inline on this page.
   - Cancel order link (only if still pending and method is COD/UPI not yet verified)

### Retry flow (in-page)
- For UPI: re-generate QR via existing service, show UPI link + textfield to submit new UTR reference → calls `confirm-upi-payment` edge function (already exists)
- For Razorpay: invoke `create-razorpay-order` + open Razorpay checkout (mirror logic from `CheckoutPage`)
- For COD: no retry needed — show info text

## Data access
All read-only via existing tables and RLS:
- `payments` (own rows)
- `orders` + `order_items` (own rows, owner policy)
- `shipment_events` (optional, for context)

No DB migration required. No new edge functions required.

## Files
**New**
- `src/pages/PaymentsListPage.tsx`
- `src/pages/PaymentDetailPage.tsx`
- `src/components/payments/PaymentStatusBadge.tsx`
- `src/components/payments/RetryPaymentPanel.tsx` (handles UPI QR + Razorpay reopen)

**Edited**
- `src/App.tsx` — register two lazy routes under `ProtectedRoute`
- `src/services/paymentService.ts` — add `listMyPayments()` and `getPaymentDetail(id)` helpers (thin wrappers around supabase queries)
- `src/components/layout/Header.tsx` or profile dropdown — add "My Payments" link (small nav addition)
- `src/pages/ProfilePage.tsx` — add a "Payments" quick-link card

## Out of scope
- New verification logic (admin tools already exist on `/admin/payments`)
- Schema changes / new edge functions
- Multi-currency formatting changes (uses existing `formatPrice`)
