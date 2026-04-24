## Reality check — what's already done vs what's missing

The payment pipeline is already structurally sound. Most of what this request asks for already exists:

| Requirement | Status today | Where |
|---|---|---|
| Server-side amount as source of truth | ✅ | `create-checkout` re-prices from DB; `verify-razorpay-payment` re-fetches Razorpay order and compares paise |
| Wrong amount rejection | ✅ | Both `verify-razorpay-payment` (client flow) and `razorpay-webhook` (gateway push) reject + log `payment_amount_mismatch` |
| Duplicate payment prevention | ✅ | Reuses pending payment row in `create-checkout`; idempotent on `payment_status='success'`; `webhook_events.provider_event_id` PK dedupe; unique index on `razorpay_payment_id` |
| Signature verification | ✅ | Constant-time HMAC compare in both client-verify and webhook |
| Webhook backup | ✅ | `razorpay-webhook` flips status independent of client confirmation |
| Transaction logging | ✅ | `analytics_events` rows: `checkout_attempt`, `checkout_succeeded`, `checkout_failed`, `checkout_quote_mismatch`, `payment_amount_mismatch` |
| Rate limiting | ✅ | `checkout_rate_limit` / `quote_rate_limit` RPCs |
| Env vars for keys | ✅ | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` already secrets — never in code |

What's actually missing for production-readiness:

1. **No automated tests** for `create-checkout`, `verify-razorpay-payment`, or `razorpay-webhook`. Without these, regressions in pricing/signature/idempotency logic are invisible.
2. **Client retry hazard.** `paymentService.startCheckout` is called directly from the Place Order button — a flaky network or a 502 surfaces as an error, but if the request actually succeeded server-side and only the response was lost, the user retries and creates a **second order + second payment row** (the idempotency dedupe in `create-checkout` only triggers if the *prior* order/payment is still findable; it keys off `(user_id, order_id)`, not the cart). Need a client-supplied **idempotency key** so retries collapse onto the same order.
3. **Webhook is mounted with default `verify_jwt = true`** in `supabase/config.toml` — Razorpay won't send a JWT, so the webhook is currently silently rejected before it even runs the signature check. This must be `verify_jwt = false`.
4. **No test/live mode switch.** `RAZORPAY_KEY_ID` is a single value. Need a documented convention: keys prefixed `rzp_test_*` vs `rzp_live_*`, plus a server-emitted `mode` field so the UI can show a "TEST MODE" banner to prevent operators charging real money during QA.
5. **Stale-pending payments** (browser killed before redirect) sit in `pending` forever. Need a sweeper to expire them after, say, 30 min, releasing reserved stock.
6. **No structured "alert"-grade metric** for amount mismatches. Today they just hit `analytics_events`; nothing surfaces them. Add a `payment_alerts` view + an admin notification on insert of `payment_amount_mismatch`.

This plan addresses 1–6. Nothing else.

## Plan

### 1. Idempotency key on checkout (prevent duplicate orders on retry)

**Schema change (migration):**
- Add `orders.idempotency_key text` and a partial unique index `(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

**`create-checkout/index.ts`:**
- Accept optional `idempotency_key: z.string().min(16).max(64)` in the request body.
- Before reserving stock, look up `orders` by `(user_id, idempotency_key)`. If found:
  - Refetch the existing payment row, return the same `{orderId, paymentId, …}` payload (re-issue the gateway artifact only if the payment is still `pending` and `razorpay_order_id` is missing — otherwise return cached values). No new stock reservation, no new order, no new gateway call.
- On insert, persist `idempotency_key`. If the unique index throws `23505`, fall through to the lookup branch above (handles concurrent retries).

**`paymentService.startCheckout`:**
- Generate a UUID v4 once per checkout attempt and pass it as `idempotency_key`. Store it in `sessionStorage` keyed on the cart hash so an in-flight retry from React Query / user double-click reuses the same key.

### 2. Webhook auth fix + config

**`supabase/config.toml`:**
- Add a function block for `razorpay-webhook` with `verify_jwt = false` so Razorpay's unauthenticated POST actually reaches our handler. The HMAC signature in the body is the auth.

### 3. Test/live mode switch

**Convention (no schema change):** the Razorpay key prefix decides the mode. `rzp_test_*` → test, `rzp_live_*` → live.

**`create-checkout/index.ts`:**
- Compute `const mode = keyId.startsWith("rzp_live_") ? "live" : "test"` and include `mode` in the response payload alongside `keyId`.
- On boot, if `Deno.env.get("ENV") === "production"` and key starts with `rzp_test_`, log a loud warning and emit an `analytics_events` row `payment_config_warning`.

**`CheckoutPage.tsx` (UI):**
- When `result.method === "razorpay"` and `result.mode === "test"`, show an amber banner: "TEST MODE — no real money will be charged". Persist nothing; just render from the response.

**Documentation:** README section "Switching Razorpay between test and live" — update the `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` secrets via Lovable Cloud. No code redeploy needed.

### 4. Stale-pending sweeper

**Migration:** create function `expire_stale_pending_payments()` (SECURITY DEFINER) that:
- Selects payments older than 30 min with `payment_status = 'pending'` and no `razorpay_payment_id`.
- For each, releases reserved stock for its order's items via the existing `release_stock` RPC, sets payment to `expired`, and order to `cancelled`.

**Scheduling:** add a `pg_cron` schedule `every 10 minutes` to run it. (If `pg_cron` isn't enabled in this project, fall back to a small `expire-stale-payments` edge function and document a Lovable Cloud cron trigger.)

### 5. Mismatch alerting

**Migration:**
- Add an `AFTER INSERT` trigger on `analytics_events WHEN event_type IN ('payment_amount_mismatch','checkout_quote_mismatch')` that inserts a row into `notifications` for every user with role `admin`. Reuses the existing notifications + realtime infra → admins see a red bell instantly.

### 6. Automated tests

Three new Deno test files under `supabase/functions/_tests/`. They hit the deployed function via fetch (same pattern as `verify_upi_payment_test.ts`) using the anon key + a test user JWT loaded from `.env`.

**`create_checkout_test.ts`** — covers:
- ✅ Correct amount: small cart → response total equals sum of DB prices, `mode` field present, `razorpayOrderId` returned.
- ✅ Wrong amount rejection: send `client_quoted_total` that disagrees with server → still succeeds (server wins) but a `checkout_quote_mismatch` analytics row exists.
- ✅ Duplicate prevention: same `idempotency_key` twice in parallel → one `orders` row, one `payments` row, identical `orderId` in both responses.
- ✅ Insufficient stock → 409.
- ✅ Min/max amount bounds → 400.
- ✅ Rate limit → 11th request in a minute returns 429.

**`verify_razorpay_payment_test.ts`** — covers (with mocked Razorpay key/secret + a deterministic HMAC fixture):
- ✅ Valid signature + matching amount → success, payment row flipped.
- ✅ Invalid signature → 400, payment row untouched.
- ✅ Amount mismatch (manual DB tweak before verify) → 400, `payment_amount_mismatch` logged.
- ✅ Idempotent: second call after success → 200 `idempotent: true`, no double credit.
- ✅ Wrong user (different JWT) → 403.

**`razorpay_webhook_test.ts`** — covers:
- ✅ Valid signature `payment.captured` → flips status, idempotent on replay (dedupe via `webhook_events.provider_event_id`).
- ✅ Invalid signature → 401.
- ✅ Unknown order_id → 200 with `found: false` (Razorpay must get 2xx or it retries forever).
- ✅ `payment.failed` → status flips to `failed`, stock released.

### 7. Client error handling polish

**`paymentService.startCheckout` & `confirmRazorpayPayment`:**
- Wrap network calls with the existing `withRetry` helper from `src/lib/retry.ts`. Configure: `retries: 3, delaysMs: [0, 600, 1800]`, `isTransient: defaultIsTransient` (only network/5xx — never retry 4xx). Combined with idempotency key from §1, retries are safe.
- On Razorpay modal `payment.failed` event in `CheckoutPage.tsx`, log `analytics_events.payment_failed_client` with the failure code and surface a friendly toast with a "Retry payment" action that re-opens the **same** Razorpay order (no new gateway call).

## Files

**Migrations** (one new file)
- `<ts>_payment_hardening.sql` — `orders.idempotency_key` + partial unique index, `expire_stale_pending_payments()` + cron schedule, `notify_admins_of_payment_alert()` trigger.

**Edge functions**
- `supabase/functions/create-checkout/index.ts` — idempotency key handling, `mode` in response, config-warning on boot.
- `supabase/functions/_tests/create_checkout_test.ts` (new)
- `supabase/functions/_tests/verify_razorpay_payment_test.ts` (new)
- `supabase/functions/_tests/razorpay_webhook_test.ts` (new)

**Config**
- `supabase/config.toml` — `[functions.razorpay-webhook] verify_jwt = false`.

**Frontend**
- `src/services/paymentService.ts` — generate + persist idempotency key; wrap in `withRetry`.
- `src/pages/CheckoutPage.tsx` — TEST MODE banner; "Retry payment" handler reusing the same Razorpay order.

**Docs**
- `README.md` — short "Razorpay test ↔ live mode" section.

**No changes**
- `verify-razorpay-payment/index.ts` — already correct (signature, amount, idempotency).
- `razorpay-webhook/index.ts` — already correct after the config.toml fix.

## Expected outcome

- A double-click or flaky-network retry on Place Order produces exactly **one** order, one payment, one Razorpay order, one charge.
- Razorpay webhook actually reaches its handler in production.
- Operators can flip between test and live by swapping two secrets — no code change, no risk of charging real cards in QA (UI banner makes test mode unmistakable).
- Stale `pending` payments self-clean after 30 min, freeing reserved stock.
- Any amount/quote mismatch fires a real-time admin notification, not just a buried log row.
- `bun run test` (Deno) covers correct/wrong/duplicate/edge-case flows for all three payment edge functions, so future refactors can't silently regress pricing or signature logic.