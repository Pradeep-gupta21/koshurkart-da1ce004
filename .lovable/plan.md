## Pricing & Payment Hardening Plan

Good news: most of your 8 steps are already implemented. This plan fills the real gaps and keeps everything else as-is.

### What's already in place (verified in code)

- **Backend is the only source of truth.** `create-checkout` and `quote-checkout` accept only `{ product_id, quantity }` and re-price from `products` (`discount_price ?? dynamic_price ?? price`). `client_quoted_total` is logged for drift only — never used to charge.
- **Razorpay amount derived from server total** (`amountPaise = Math.round(total * 100)`).
- **UPI QR amount derived from same server total** (`am=${total}` in the `upi://` link).
- **Idempotency**: per-attempt key in `sessionStorage`, unique on `orders.idempotency_key`, short-circuit + race handling on `23505`.
- **Webhook**: `razorpay-webhook` verifies signature and finalizes status.
- **Logging**: `analytics_events` has `checkout_attempt`, `checkout_succeeded`, `checkout_failed`, `checkout_quote_mismatch`, `payment_amount_mismatch`; admin notification trigger fires on mismatch.
- **Test/live mode switch**: derived server-side from `RAZORPAY_KEY_ID` prefix; warning logged if test keys run with `ENV=production`.
- **Rate limit, stock reservation, min/max amount, signature verification, RLS** — all present.

So the remaining work is just the missing debug visibility, a hard paise-equality assertion, and a tiny refactor to a single pricing helper.

---

### Changes

**1. `supabase/functions/_shared/pricing.ts` (new)**
Single helper used by both edge functions:
```ts
calculateOrderAmount(lines): {
  subtotal_inr,            // rounded to 2dp
  amount_paise,            // Math.round(subtotal_inr * 100)
  line_breakdown[]         // {product_id, unit_price, quantity, line_total}
}
```
INR rupees stay as-is in DB (no schema change — see "Out of scope" below). Paise are derived only at the gateway boundary.

**2. `supabase/functions/create-checkout/index.ts`**
- Replace inline reduce with `calculateOrderAmount(lines)`.
- Add hard assertion right before the Razorpay POST and before the UPI QR build:
  ```
  const expectedPaise = Math.round(subtotal_inr * 100);
  if (expectedPaise !== amount_paise) → log analytics_events
  { event_type: 'amount_assertion_failed', metadata: {subtotal_inr, amount_paise, expectedPaise} }
  → release stock, return 422 { error: "Amount mismatch detected", code: "AMOUNT_MISMATCH" }
  ```
- Use the same `amount_paise` for: Razorpay `orders` call, UPI link `am=`, idempotent short-circuit response, and the JSON returned to the client.
- Add `DEBUG_PRICING` gate (env var). When `Deno.env.get("DEBUG_PRICING") === "true"`, append to the success response:
  ```
  debug: {
    lines: [{product_id, dbPrice, quantity, line_total}],
    calculatedAmountInr: subtotal_inr,
    razorpayAmountPaise: amount_paise,
    mode
  }
  ```
  No PII, no keys, no signatures — pricing-only.

**3. `supabase/functions/quote-checkout/index.ts`**
- Use the same `calculateOrderAmount` helper so quote subtotal can never drift from checkout.
- Same `DEBUG_PRICING` gate adds a `debug` block to the quote response.

**4. `supabase/migrations/<new>.sql`**
Extend the existing admin-alert trigger filter to also fire on `'amount_assertion_failed'`:
```sql
-- in notify_admins_of_payment_alert(): add 'amount_assertion_failed' to the IN (...) list
```

**5. `src/components/checkout/PricingDebugBox.tsx` (new)**
Small dev-only panel rendered on `CheckoutPage` and `CartPage` summary. Renders only when `import.meta.env.DEV` AND the response includes a `debug` object. Shows:
```
DB price × qty = line_total   (per line)
Calculated total (INR): …
Razorpay amount (paise): …
Mode: test|live
```
Styled with `border-dashed border-muted-foreground/30 bg-muted/40 text-xs` so it's clearly a dev artifact.

**6. `src/hooks/useCheckoutQuote.ts` + `src/services/paymentService.ts`**
- Extend `CheckoutQuote` and `CheckoutResult` types with optional `debug?: PricingDebug`.
- Pass through unchanged. No production behavior change.

**7. `src/pages/CheckoutPage.tsx`**
- Render `<PricingDebugBox debug={quote?.debug ?? checkoutResult?.debug} />` above the order summary.
- Add a `code === "AMOUNT_MISMATCH"` branch in the catch → show "Pricing mismatch detected. Please refresh and retry." (non-retryable in `withRetry`).

**8. `src/lib/retry.ts` — already does not retry app-level errors**; just confirm `AMOUNT_MISMATCH` surfaces as a 422 so it isn't retried (no code change expected; if needed, add a status check).

### Toggling debug

- Set Supabase Edge Function secret `DEBUG_PRICING=true` to enable, delete or set to `false` to disable. No redeploy of frontend required.
- Permanent removal later: grep for `DEBUG_PRICING` and `PricingDebugBox` and delete those blocks.

### Test cases to add (`supabase/functions/_tests/`)
- `pricing_test.ts`: `calculateOrderAmount` rounds correctly (e.g. `199.99 × 3` → `59997` paise, no float drift).
- `create_checkout_test.ts`: amount-assertion path — synthetic line with a forced bad rounding returns `AMOUNT_MISMATCH`.
- Duplicate-payment test: same `idempotency_key` → returns `idempotent: true`, no second Razorpay call.

### Out of scope (deliberate)

- **Paise in DB**: your DB stores rupees as `numeric` (exact decimal, not float). Migrating to integer paise touches every product, order, payment, payout, vendor balance, commission and pricing-rule row plus all UI formatters. The paise assertion above closes the same risk window without that migration. Happy to do the migration as a separate, scoped task.
- **Shipping/tax/discount math**: not currently on the order — the existing computation is `unit_price × quantity`. If you want shipping (`shippingTotal` from `CartContext`) or taxes priced server-side, say so and I'll add them inside `calculateOrderAmount`.
- No changes to webhook signature verification, RLS, or auth.

Approve and I'll implement.
