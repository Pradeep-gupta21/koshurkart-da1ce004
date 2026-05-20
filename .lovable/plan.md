## Goal
Finish converting the existing payment stack into a clean, Razorpay-first, production-grade flow. Most pieces already exist (create-order edge fn, signature verification, HMAC webhook with dedupe, vendor earnings trigger, idempotency keys, audit log). This plan closes the remaining gaps and removes the manual UPI/QR path from the Razorpay flow.

## What already works (keep as-is)
- `create-razorpay-order` (server reprices + creates order/payment + Razorpay order)
- `verify-razorpay-payment` (HMAC verify, amount/currency check vs Razorpay API, idempotent)
- `razorpay-webhook` (HMAC verify, `webhook_events` dedupe, handles `payment.captured` / `payment.failed`)
- Vendor earnings auto-credit via `on_payment_success` trigger; refund reversal via `on_order_refund_reverse_earnings`
- `payment_audit_log` (status transitions) + `webhook_events` (raw payloads)
- Idempotency keys in `paymentService.startCheckout`, retry via `withRetry`

## Changes

### 1. Make Razorpay the primary method (remove manual QR)
- `src/pages/CheckoutPage.tsx`: drop the "Pay using UPI" (manual QR/proof upload) option from `ALL_PAYMENT_METHODS`. Razorpay's checkout modal already covers UPI + cards + netbanking + wallets natively.
- Default selection order: `razorpay` → `cod`. Remove `upi_pending` flow state, QR rendering block, proof upload, `confirmUpiPayment` calls.
- `src/config/platformSettings.ts`: keep `upiEnabled` shape but stop exposing it in checkout UI (admin toggle stays for backward compat).
- Polish Razorpay card: prominent "Recommended", show accepted method icons (UPI/Card/Netbanking/Wallet), loading + retry states.

### 2. Dedicated result pages
- New `src/pages/PaymentSuccessPage.tsx` at `/payment/success?orderId=…` — confirmation, order summary link, "Continue shopping". Replaces inline success block.
- New `src/pages/PaymentFailedPage.tsx` at `/payment/failed?orderId=…&reason=…` — error reason, "Retry payment" button that routes to `/payments/:id` (existing RetryPaymentPanel).
- Wire `App.tsx` routes; Checkout navigates to these on terminal states.

### 3. Unified payment_logs (richer than audit log)
- New table `payment_logs(id, payment_id, event_type, message, metadata jsonb, created_at)` with RLS:
  - Admins read all
  - Vendors read logs for payments on orders containing their items
  - Users read logs for their own payments
  - Inserts only via SECURITY DEFINER helper `log_payment_event(p_payment_id, p_event_type, p_message, p_metadata)`
- Emit logs from:
  - `create-razorpay-order` → `order_created`
  - `verify-razorpay-payment` → `verify_success` / `verify_failed` / `amount_mismatch`
  - `razorpay-webhook` → `webhook_captured` / `webhook_failed` / `webhook_duplicate` / `webhook_mismatch`
  - Trigger on `payments` status change → `status_changed` (replaces having to read audit_log separately)

### 4. Admin upgrades (`src/pages/admin/AdminPayments.tsx`)
- Tabs: **All / Pending / Failed / Razorpay**.
- Row click → drawer with: payment fields, related order, full `payment_logs` timeline, raw `webhook_events` for that `razorpay_order_id`.
- "Re-verify with Razorpay" button on failed/pending → calls a new edge fn `admin-resync-payment` that fetches `/v1/payments/{id}` from Razorpay and reconciles status server-side (admin-only via `has_role`).
- Failed payments counter card at the top.

### 5. Edge function: `admin-resync-payment`
- Auth: requires admin role (`has_role`).
- Input: `paymentId`.
- Fetches Razorpay payment by `razorpay_payment_id` (or order if missing), reapplies amount/currency check, updates `payments` + `orders`, writes a `payment_logs` entry. Idempotent.

### 6. Secrets check
- Required env vars (already expected): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Will verify via `fetch_secrets` before deploying; request any missing via `add_secret`.

## Out of scope
- Replacing existing UPI manual flow in DB (kept for old records; just removed from new checkout UI).
- Payouts UI changes (existing `payouts` table + vendor flow untouched).
- Multi-currency (locked to INR as requested).
- Real commission % (stays 0; existing `commission_percentage` column + `calculateCommission` already future-proof).

## Technical notes
- DB migration adds `payment_logs` table, RLS policies, `log_payment_event` SECURITY DEFINER fn, and a trigger `on_payment_status_log` mirroring status transitions into `payment_logs`.
- No edits to `src/integrations/supabase/{client,types}.ts` (auto-generated).
- Webhook continues to be public (`verify_jwt = false` already in `config.toml`); auth is via HMAC signature only.

## Files touched
- New: `src/pages/PaymentSuccessPage.tsx`, `src/pages/PaymentFailedPage.tsx`, `supabase/functions/admin-resync-payment/index.ts`, migration.
- Edited: `src/App.tsx`, `src/pages/CheckoutPage.tsx`, `src/pages/admin/AdminPayments.tsx`, `supabase/functions/create-razorpay-order/index.ts`, `supabase/functions/verify-razorpay-payment/index.ts`, `supabase/functions/razorpay-webhook/index.ts`, `supabase/config.toml` (register new fn).