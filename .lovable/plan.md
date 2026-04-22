
## Reality check

Five distinct fixes against confirmed gaps in the live schema. No invention — each maps to an existing trigger/RPC/table pattern.

| Fix | Confirmed gap |
|---|---|
| 1. COD auto-credit on delivery | `on_shipping_status_change` syncs `order_status` only; `payments.payment_status` stays `pending` for COD → `on_payment_success` never fires |
| 2. UPI server-side verification | `confirmUpiPayment` flips status client-side; admin manually approves in `AdminPayments.tsx` — no edge function gate |
| 3. Payout validation | `payouts` INSERT policy only checks ownership; no balance/bank check. `requestPayout` in `VendorPayments.tsx` allows any amount |
| 4. Earnings reversal on cancel/return | `on_order_status_change` recalcs trust score but never debits `vendors.total_earnings` / `withdrawable_balance` |
| 5. Stale order sweeper | No cron; abandoned `pending` orders hold `reserved_stock` forever |

## Plan

### 1. COD: auto-credit on delivery (DB-only, atomic)

New trigger `on_cod_delivered_credit` on `orders` AFTER UPDATE. When `shipping_status` transitions to `delivered` and the linked payment is COD with `payment_status != 'success'`, update `payments.payment_status = 'success'` for that order. The existing `on_payment_success` BEFORE-UPDATE trigger on `payments` then runs the per-vendor split + sets `credited_at` — no duplication.

Idempotent: guarded by `credited_at IS NULL` check already in `on_payment_success`.

### 2. UPI verification edge function

New `supabase/functions/verify-upi-payment/index.ts`. Auth: JWT-validated admin only (`has_role(uid,'admin')` via service-role lookup). Body: `{ paymentId, orderId, action: 'approve'|'reject', transactionId?, note? }`.

- On `approve`: set `payments.payment_status='success'`, `transaction_id`, `credited_at` left to trigger; set `orders.payment_status='paid'`, `order_status='confirmed'`. Trigger handles vendor credit.
- On `reject`: set `payments.payment_status='failed'`, `orders.payment_status='failed'`, release reserved stock for each line item via `release_stock` RPC.

Wire `AdminPayments.tsx` `handleApprove`/`handleReject` to call this function instead of direct table writes. Removes RLS-bypass surface from the client; keeps the existing UI.

Out of scope: automatic UPI gateway verification (no PSP webhook configured) — admin-mediated flow stays, but is now backend-enforced.

### 3. Payout rules: balance + bank verification gate

New trigger `validate_payout_request` BEFORE INSERT on `payouts`:
- Reject if `amount <= 0`
- Reject if `amount > vendors.withdrawable_balance`
- Reject if `vendors.bank_verified = false`
- Reject if `vendors.kyc_status != 'approved'`

Same trigger AFTER UPDATE on `payouts` (when `status` becomes `'completed'`): debit `vendors.withdrawable_balance` by `amount`. Idempotent via a new `payouts.debited_at timestamptz` column.

Update `VendorPayments.tsx` `requestPayout` to surface the trigger's error message via toast (no client logic changes besides better error rendering).

### 4. Earnings reversal on cancel/return

New trigger `on_order_refund_reverse_earnings` on `orders` AFTER UPDATE. When `order_status` transitions to `cancelled` or `returned` AND the linked payment has `credited_at IS NOT NULL`:

For each `order_items` row by vendor, recompute the same per-vendor share formula used in `on_payment_success`, then:
- Decrement `vendors.total_earnings` and `vendors.withdrawable_balance` by that share (clamp `withdrawable_balance` at 0)
- Decrement `vendors.total_sales` by 1
- Set `payments.credited_at = NULL` AND a new `payments.reversed_at = now()` to mark reversal (prevents double-reversal; allows re-credit if order is reinstated, though that flow isn't supported today)

Also release reserved stock + decrement `products.sales_count` if the order had reached `delivered` before the reversal.

### 5. Scheduled stale-order sweeper

Enable `pg_cron` + `pg_net` (idempotent). New SECURITY DEFINER function `sweep_stale_orders()`:
- Find `orders` where `order_status='processing'` AND `payment_status='pending'` AND `created_at < now() - interval '30 minutes'` AND payment method is not COD
- For each: mark `payment_status='failed'`, `order_status='cancelled'`, call `release_stock(product_id, quantity)` for every line item

Schedule via `cron.schedule('sweep-stale-orders', '*/10 * * * *', $$select sweep_stale_orders()$$)`. Uses internal SQL only — no edge function HTTP overhead. Logged via existing `vendor_audit_log` pattern (new `system_audit_log` is overkill; use `analytics_events` with `event_type='order_auto_cancelled'`).

## Files

**Migrations** (`supabase/migrations/<ts>_*.sql`)
- `cod_auto_credit.sql` — `on_cod_delivered_credit` trigger
- `payout_validation.sql` — `payouts.debited_at` column, `validate_payout_request` BEFORE INSERT trigger, `debit_balance_on_payout_complete` AFTER UPDATE trigger
- `earnings_reversal.sql` — `payments.reversed_at` column, `on_order_refund_reverse_earnings` trigger
- `stale_order_sweeper.sql` — enable `pg_cron`/`pg_net`, `sweep_stale_orders()` function, cron schedule

**Create**
- `supabase/functions/verify-upi-payment/index.ts` — admin-gated UPI approve/reject
- `supabase/functions/_tests/verify_upi_payment_test.ts` — Deno test for auth + admin gate

**Edit**
- `src/pages/admin/AdminPayments.tsx` — call `verify-upi-payment` function instead of direct writes
- `src/services/paymentService.ts` — add `verifyUpiPayment(paymentId, orderId, action, ...)` wrapper
- `src/pages/vendor/VendorPayments.tsx` — show trigger error in toast on payout request rejection
- `src/integrations/supabase/types.ts` — auto-regenerated
- `supabase/config.toml` — register `verify-upi-payment` (default `verify_jwt = false`; we validate inside)
