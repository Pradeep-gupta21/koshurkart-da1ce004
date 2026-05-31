# Razorpay Test Checkout — End-to-End Verification Plan

Goal: place a real test-mode order through the live checkout flow, pay with a Razorpay test card, and confirm the webhook flips the order + payment rows to the correct terminal states.

## 1. Pre-flight checks (read-only)
- Confirm rotated secrets are live: `fetch_secrets` shows `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` present in Lovable Cloud.
- `supabase--read_query` on the latest row of `orders` and `payments` to record a baseline (so we can diff after the test).
- Verify webhook URL in Razorpay dashboard points to:
  `https://xlqzbomiuuadxcygnsal.supabase.co/functions/v1/razorpay-webhook`
  with events: `payment.captured`, `payment.failed`, `order.paid` (whichever the function handles — confirmed by reading `supabase/functions/razorpay-webhook/index.ts`).

## 2. Drive the checkout in the browser
Use `browser--navigate_to_sandbox` + `browser--act`:
1. Log in as a test user (or use the currently-logged-in preview session).
2. Add 1 in-stock product to cart → go to `/checkout`.
3. Fill shipping form, select **Razorpay** payment method, submit.
4. In the Razorpay modal, pay with the official test card:
   - Card: `4111 1111 1111 1111`
   - Expiry: any future date, CVV: any 3 digits, OTP: `1234`
5. Wait for redirect to `/payment/success` (capture screenshot + console + network).

## 3. Verify DB state after success
Run `supabase--read_query`:
```sql
select id, status, payment_status, total, updated_at
from orders order by created_at desc limit 1;

select id, order_id, provider, provider_payment_id, status, amount, updated_at
from payments order by created_at desc limit 1;
```
Expected:
- `orders.payment_status = 'paid'`, `orders.status` advanced to `confirmed`/`processing` (whichever the order lifecycle uses).
- `payments.status = 'captured'` (or `success`), `provider_payment_id` populated with `pay_…`.

## 4. Verify webhook independently
- `supabase--edge_function_logs` for `razorpay-webhook` and `verify-razorpay-payment` — confirm 200s, no signature errors, idempotency key respected.
- `supabase--analytics_query` on `function_edge_logs` filtered to `razorpay-webhook` for the test window.
- Confirm `auth_logs` / `payment_events` (if present) contain the captured event.

## 5. Negative path (optional but recommended)
Re-run with the Razorpay **failure** test card `4000 0000 0000 0002` and confirm:
- Redirect to `/payment/failed`.
- `orders.payment_status = 'failed'`, `payments.status = 'failed'`.
- Webhook logs show `payment.failed` handled once.

## 6. Report
Deliver a short table: timestamp, order id, payment id, pre-state → post-state, webhook log line, pass/fail per assertion. If anything fails, identify whether the break is in `create-razorpay-order`, `verify-razorpay-payment`, or `razorpay-webhook` and propose a fix (no code changes in this plan).

## Notes / risks
- This is read-and-observe + one real test transaction in Razorpay **test mode** — no live money.
- If the Razorpay modal can't be driven via `browser--act` (cross-origin iframe), I'll fall back to calling `create-razorpay-order` via `supabase--curl_edge_functions`, then simulate a signed webhook POST to `razorpay-webhook` using `RAZORPAY_WEBHOOK_SECRET` to validate the server side deterministically.
- No schema or code changes are part of this plan; if a bug surfaces I'll come back with a fix plan.
