

## Reality check — payment security audit

Walked through all three edge functions, the `payments` table, RLS, and triggers. Five categories of risk; some are critical.

### Critical risks

| # | Risk | Evidence | Severity |
|---|---|---|---|
| 1 | **Amount tampering** — neither `verify-razorpay-payment` nor `verify-upi-payment` checks `payment.amount == orders.total`. A user can create an order for ₹50,000, pay ₹1 via Razorpay, and the signature still validates because Razorpay only signs `order_id|payment_id`. | `verify-razorpay-payment/index.ts` lines 80–119 — no amount cross-check against the Razorpay order's amount or the local order total | **Critical** |
| 2 | **Webhook function not deployed** — `razorpay-webhook/index.ts` exists with HMAC verification, but is **not registered** in `supabase/config.toml`. Without `verify_jwt = false` it will reject Razorpay's unsigned POSTs. Result: if the user's browser closes mid-checkout, payment is captured but DB stays `pending` forever. | `config.toml` only lists `verify-upi-payment`, `location`, `razorpay-webhook` line missing | **Critical** |
| 3 | **Duplicate payment writes possible** — no DB unique constraint on `razorpay_payment_id` or `transaction_id`. Replaying the same `verify-razorpay-payment` request twice (e.g., browser retry + webhook race) inserts/updates twice; while `on_payment_success` is idempotent via `credited_at`, the `payments` row itself can be double-credited if there are two rows. | `payments` table indexes: only `payments_pkey`. No unique on `razorpay_payment_id`. | **High** |
| 4 | **Dead simulator code path** — `paymentService.verifyPayment()` returns success with `Math.random() > 0.05`. Currently unused by `processPayment`, but the export is callable from anywhere and could be wired into a future flow by accident. | `paymentService.ts` lines 52–71 | **High** |
| 5 | **No replay/rate limit on payment endpoints** — both edge functions accept unlimited verification attempts per user. Allows enumeration of `paymentId`/`orderId` combos and brute-force of signatures (computationally infeasible but rate limit is defense-in-depth). | No `rateLimiter` import in either function | **Medium** |

### Medium risks

| # | Risk | Evidence |
|---|---|---|
| 6 | UPI `confirmUpiPayment` writes `payment_status='pending_verification'` from the client. RLS only has admin write + user insert — **no user UPDATE policy**, so this currently fails silently. The client code assumes success. | `payments` policies: no `Users update own payments` row. Client call in `paymentService.ts:219` will return RLS error but caller treats data as truthy |
| 7 | `qr_code_url` and `payment_proof` writes to `product-images` bucket (public) leak proof screenshots publicly via predictable path. | `paymentService.ts:243` uses `'product-images'` bucket |
| 8 | Razorpay webhook (when wired) does not check **amount or currency** — same tampering surface as #1 if a malicious actor can trigger arbitrary Razorpay events. | `razorpay-webhook/index.ts` lines 78–99 |
| 9 | No idempotency key on `processPayment` — fast double-click on "Pay" creates two `payments` rows for one order. | `paymentService.ts:79` |

### What's already correct (don't re-engineer)

- HMAC SHA-256 signature verification for Razorpay payment + webhook ✅
- Service-role key used only inside edge functions ✅
- Admin gate on UPI verification via `has_role()` RPC ✅
- COD auto-credit + earnings reversal triggers ✅
- Stale order sweeper (cron every 10 min) ✅
- Payout balance + KYC validation trigger ✅

## Plan — fix the 9 risks

### 1. Amount verification (Critical)

In `verify-razorpay-payment/index.ts`, after signature passes:
- Fetch the Razorpay order by ID via `GET https://api.razorpay.com/v1/orders/{razorpayOrderId}` using basic auth
- Assert `razorpayOrder.amount == round(payments.amount * 100)` AND `razorpayOrder.currency == 'INR'`
- Fetch the local `payments.amount` server-side (don't trust client-supplied amount)
- Reject with 400 if mismatch; log to `analytics_events` as `payment_amount_mismatch`

Same check in `razorpay-webhook/index.ts` — compare `payment.amount` (paise) from webhook payload to local row.

### 2. Wire webhook into config + harden

- Add `[functions.razorpay-webhook] verify_jwt = false` to `supabase/config.toml`
- Add amount/currency check (per #1)
- Add `RAZORPAY_WEBHOOK_SECRET` to required secrets if not set (check via secrets tool first; if missing, prompt user)
- Document webhook URL for user to paste in Razorpay dashboard

### 3. Dedupe at DB level

Migration:
```sql
CREATE UNIQUE INDEX payments_razorpay_payment_id_uniq
  ON public.payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE UNIQUE INDEX payments_transaction_id_uniq
  ON public.payments (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX payments_one_success_per_order
  ON public.payments (order_id)
  WHERE payment_status = 'success';
```

Last index guarantees: only one successful payment row per order, ever. Webhook + verify edge function races become safe (second insert/update fails with `23505`, edge function catches and treats as already-verified success).

### 4. Remove dead simulator

Delete `verifyPayment()` from `paymentService.ts`. No callers. Replace with a thrown error if anything imports it (TS will catch).

### 5. Per-user rate limit on verification endpoints

Add a small in-function token-bucket: max 10 verify calls per user per minute. Use a `payment_verification_attempts` table (user_id, count, window_start) updated atomically via UPSERT in the edge function. Return 429 when exceeded.

### 6. Fix UPI client→server confirmation

Move `confirmUpiPayment` logic into a new edge function `confirm-upi-payment` (user-authed, not admin):
- Validates JWT
- Validates the `payment.user_id == auth.uid()` and `payment.payment_method == 'upi'`
- Sets `payment_status='pending_verification'`, attaches `payment_proof` URL
- Updates order to `processing`

Remove the client-side `supabase.from('payments').update(...)` from `paymentService.ts:219`. RLS stays clean (no user UPDATE policy needed).

### 7. Move payment proofs to private bucket

- Create `payment-proofs` private bucket (RLS: user reads own, admin reads all)
- Storage policies on `{user_id}/...` prefix
- Switch `uploadPaymentProof` to upload there + return a **signed URL** (1-hour TTL) instead of public URL

### 8. Webhook amount + currency check

Same pattern as #1, applied inside `razorpay-webhook/index.ts` before flipping status.

### 9. Idempotency on `processPayment`

Before inserting a new `payments` row, check if a `pending` row exists for `(user_id, order_id)`. If yes, return it instead of creating a duplicate. Prevents double-click double-charge.

## Industrial-level architecture target

### Architecture improvements
1. **Outbox pattern** for payment events: edge function writes to `payment_events` table; a worker (cron or pg_net) drives downstream side effects (notifications, analytics, vendor credit). Decouples gateway latency from user-facing response.
2. **State machine** column on `payments`: `pending → authorized → captured → settled → refunded | failed | cancelled`. Today's loose strings invite drift. Add `CHECK` constraint + transition trigger.
3. **Webhook deduplication table**: `webhook_events(provider_event_id PRIMARY KEY, processed_at)`. Razorpay retries up to 24 hours; PK insert prevents double-processing.
4. **Multiple gateway abstraction**: `payment_provider` enum + per-provider strategy module (current code hard-codes Razorpay paths). Enables Stripe/Cashfree/PhonePe later.

### Performance improvements
1. Composite indexes: `(order_id, payment_status)`, `(user_id, created_at DESC)` — current `payments_pkey` only.
2. Stop fetching `fetchPlatformSettings()` on every `createPayment` call — cache for 5 min via existing `cacheService` (already used elsewhere).
3. Webhook handler: return 200 immediately, defer DB work via `pg_net` async POST → keeps Razorpay retry budget.

### Security improvements (in addition to #1–#9)
1. **PCI scope** — never log `razorpay_payment_id`, `upi_id`, or `transaction_id` (currently `console.error` may leak). Use the existing `logger` with redaction.
2. **Secret rotation** — document `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` rotation runbook.
3. **CSP for Razorpay checkout** — add `https://checkout.razorpay.com` to `script-src`, `https://api.razorpay.com` to `connect-src`.
4. **Audit log** — every state transition on `payments` writes to `payment_audit_log(payment_id, old_status, new_status, actor, source, at)`. Forensics on disputes.
5. **3DS / step-up** — Razorpay handles, but enforce `payment.captured` (not just `authorized`) before crediting earnings.

### Scalability improvements
1. **Partition `payments` by month** when row count > 10M (declarative partitioning on `created_at`).
2. **Move analytics aggregations** off the hot path (materialized views refreshed every 15 min instead of per-request `getPayoutSummary`).
3. **Outbox + worker** (above) — replaces synchronous trigger fan-out, prevents long-running `on_payment_success` blocking inserts.
4. **Read replicas** for vendor analytics queries — Supabase supports via Postgres connection routing.

## Final ideal payment flow (Amazon/Flipkart-style)

```text
1. Cart → Checkout
   Client builds cart, calls create-order edge function with line items.
   Server: validates stock, computes total server-side (no client price trust),
           reserves inventory atomically, inserts orders row (status=processing,
           payment_status=pending), returns orderId + total.

2. Choose payment method
   Client calls create-payment-intent (per-provider edge function).
   Server: re-fetches orders.total from DB (NEVER trust client amount),
           creates pending payments row with idempotency key (user_id+order_id),
           creates Razorpay/UPI order, returns gateway tokens.

3. Customer pays on gateway
   Razorpay/UPI/PSP handles card data — your servers never see PAN.
   Customer is 3DS-stepped if required.

4. Dual confirmation: client callback + webhook
   a) Client receives signature from gateway → POSTs to verify-payment.
      Server: HMAC verify, AMOUNT verify (gateway order.amount == DB amount),
              attempts UPSERT into payments with unique constraint on
              gateway_payment_id. State transitions pending → captured.
   b) Webhook arrives in parallel from gateway.
      Server: HMAC verify, dedupe via webhook_events PK,
              same UPSERT — whichever wins is fine.

5. Trigger fans out (outbox pattern)
   on_payment_success trigger writes payment_events row.
   Async worker: credits vendor earnings, releases reservation hold,
                 sends notification, fires analytics, schedules fulfillment.

6. Order moves through fulfillment
   processing → confirmed → packed → shipped → out_for_delivery → delivered.
   Per-vendor sub-orders progress independently for multi-vendor carts.

7. Settlement (T+N)
   Daily cron computes vendor settlement amounts from captured payments
   minus refunds/chargebacks/commission. Writes to vendor_settlements.
   Vendor requests payout → validate_payout_request trigger gates on
   bank_verified + KYC + sufficient withdrawable_balance.

8. Refund / cancellation
   Admin or customer initiates refund → call gateway refund API →
   webhook confirms → on_order_refund_reverse_earnings trigger debits
   vendor balance and releases inventory.

9. Stale cleanup
   sweep_stale_orders cron every 10 min: pending+unpaid > 30 min →
   cancel order, release inventory, free reservation, notify user.
```

## Files

**Migrations**
- `<ts>_payment_dedupe_indexes.sql` — three unique indexes (#3)
- `<ts>_payment_audit_log.sql` — `payment_audit_log` table + trigger
- `<ts>_webhook_events_dedupe.sql` — `webhook_events(provider_event_id PK)`
- `<ts>_payment_proofs_bucket.sql` — private `payment-proofs` bucket + RLS

**Edge functions — edit**
- `verify-razorpay-payment/index.ts` — server-side amount fetch + check; per-user rate limit; redact logs
- `razorpay-webhook/index.ts` — amount + currency check; webhook_events dedupe
- `create-razorpay-order/index.ts` — re-fetch order total from DB, ignore client `amount`

**Edge functions — create**
- `confirm-upi-payment/index.ts` — user-authed UPI confirmation (replaces client write)

**Config**
- `supabase/config.toml` — register `razorpay-webhook`, `confirm-upi-payment` with `verify_jwt = false`

**Client**
- `src/services/paymentService.ts` — remove `verifyPayment()` simulator (#4); switch `confirmUpiPayment` to invoke new edge function (#6); switch `uploadPaymentProof` to private bucket + signed URL (#7); add idempotency check in `processPayment` (#9)
- `src/integrations/supabase/types.ts` — auto-regenerated

**Secrets**
- Verify `RAZORPAY_WEBHOOK_SECRET` exists; if missing, prompt user before deploy

## Out of scope (intentional)

- Stripe / Cashfree multi-provider abstraction — architecture noted, not building speculatively
- Partitioning `payments` — premature at current scale
- Outbox + worker — flagged as the right next step but a separate workstream; current triggers stay
- 3DS enforcement override — Razorpay default already correct

