## Reality check

Most of this is already done in the previous turns:

- **`create-checkout` edge function** is the single source of truth — it re-prices from DB, reserves stock, computes totals in INR, creates `orders`/`order_items`/`payments`, then mints the Razorpay order or UPI QR using the **server total**. Client never sends prices.
- **`verify-razorpay-payment`** fetches the Razorpay order back, checks `rpOrder.amount === payments.amount * 100` and `currency === "INR"`, logs mismatches to `analytics_events`, has signature HMAC-SHA256 with constant-time compare, and is idempotent via the `one_success_per_order` unique index plus `razorpay_payment_id` uniqueness.
- **`razorpay-webhook`** independently confirms the same payment.
- **Frontend `paymentService.startCheckout`** calls the edge function with only `{product_id, quantity}`.

Two gaps remain that match what the user is asking for:

1. **The UI still shows a client-computed cart total** (`CartContext.totalPrice` from localStorage `product.price`). If the DB price changes between adding-to-cart and checkout, the user sees ₹X on cart, but the server quotes ₹Y on checkout — same family of "UI doesn't match payment" the user is describing. There is no explicit "Final amount: ₹XXX (server-quoted)" step before paying.
2. **`create-checkout` has no rate limiting** and only ad-hoc `console.error` logs — no structured price-tampering audit trail.

Plan addresses exactly those.

## Plan

### 1. New edge function `quote-checkout` (read-only price quote)

Same input shape as `create-checkout` but **no writes, no stock reservation, no gateway call**. Returns the server-priced line items + total.

```ts
// POST { items: [{product_id, quantity}] }
// → { lines: [{product_id, title, image, quantity, unit_price, line_total}],
//     subtotal, currency: "INR", quote_id, expires_at }
```

Used by:
- Cart page — to show "Server total: ₹XXX" alongside the local estimate when they differ.
- Checkout page — to show **"Final amount: ₹XXX"** (locked) before "Place Order" is enabled.

`quote_id` is `crypto.randomUUID()`; `expires_at = now + 5 min`. We don't persist quotes (stateless); the quote is purely informational. The actual price binding happens server-side at `create-checkout` time anyway, so `quote_id` is just a UX artifact ("the price you saw is the price we'll charge, refresh if older than 5 min").

### 2. Frontend — surface server total

**`src/hooks/useCheckoutQuote.ts`** (new) — React Query hook:
- `queryKey: ['checkout-quote', sortedItems]`, `staleTime: 60s`, `refetchInterval: 4 min`.
- Returns `{ data: quote, isLoading, error, refetch }`.

**`src/pages/CheckoutPage.tsx`**
- Fetch quote on mount (and on cart change).
- Replace the "Order Summary" `formatPrice(totalPrice)` with `formatPrice(quote.subtotal)`.
- Add a prominent block:
  ```
  Final amount: ₹XXX
  This is the exact amount you will be charged.
  ```
- Show `Loader2` skeleton while `isLoading`.
- On error, show retry button and disable "Place Order".
- Detect drift: if `quote.subtotal !== client totalPrice`, show a small notice "Prices updated since you added to cart" and update display to server value.
- Disable "Place Order" while quote is stale/loading/erroring.

**`src/pages/CartPage.tsx`**
- Same hook, smaller treatment: show server subtotal under the local estimate when they differ; "Proceed to Checkout" remains enabled (real binding is at checkout).

### 3. `create-checkout` hardening

**Rate limiting** — sliding window via DB function:

```sql
create or replace function public.checkout_rate_limit(_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  select count(*) into cnt
  from analytics_events
  where user_id = _user_id
    and event_type = 'checkout_attempt'
    and created_at > now() - interval '1 minute';
  return cnt < 10;  -- max 10 checkouts/min/user
end $$;
```

In `create-checkout` after auth, call the RPC; on `false` return `429 { error: "Too many checkout attempts" }`. Log every attempt as `analytics_events` with `event_type='checkout_attempt'`.

**Structured logging** — in addition to existing `console.error`, write to `analytics_events`:
- `checkout_attempt` — user_id, item count, payment_method
- `checkout_succeeded` — order_id, total, method
- `checkout_failed` — reason (`stock`, `inactive_product`, `min_amount`, `gateway_error`, `rate_limited`)

**Quote-vs-actual drift logging** — accept optional `client_quoted_total` in the request. If it differs from server total by more than ₹0.01, write `event_type='checkout_quote_mismatch'` (don't reject — server total wins, but we want the audit). The frontend will pass the quote it just fetched. This catches stale clients and any tampering attempt.

### 4. `quote-checkout` hardening

Same auth + rate limit (`event_type='quote_attempt'`, 30/min/user — quotes are cheaper and may be re-fetched).

### 5. Files

**Migration**
- `<ts>_checkout_rate_limit.sql` — `checkout_rate_limit(uuid)` and `quote_rate_limit(uuid)` SECURITY DEFINER functions.

**New**
- `supabase/functions/quote-checkout/index.ts`
- `src/hooks/useCheckoutQuote.ts`

**Edit**
- `supabase/functions/create-checkout/index.ts` — rate limit, structured logging, accept `client_quoted_total`, log drift.
- `src/services/paymentService.ts` — add `quoteCheckout(items)`; `startCheckout` accepts optional `clientQuotedTotal`.
- `src/pages/CheckoutPage.tsx` — show server-quoted "Final amount", loading/error states, gate "Place Order" on a fresh successful quote.
- `src/pages/CartPage.tsx` — show server subtotal with drift hint.
- `supabase/config.toml` — register `quote-checkout`.

### 6. Out of scope (intentional)

- Persisting quotes server-side / signed quote tokens — overkill given `create-checkout` already re-prices from DB at bind time. The quote is purely a UX preview.
- Gateway-level rate limiting — Supabase platform already throttles per-IP; user-scoped DB limit is the meaningful guard.
- IP-based limits — Edge runtime doesn't expose a stable client IP through the proxy; `user_id` scoped is the correct unit.

### Expected end state

- Cart page: shows server-priced subtotal with a "prices updated" notice if it drifted from local cache.
- Checkout page: prominent "Final amount: ₹XXX — this is what you will be charged", loaded from `quote-checkout`, with loading/error states, and "Place Order" disabled until the quote is fresh.
- Razorpay/UPI charge always equals that displayed final amount (already true after the previous turn's work).
- Server rejects checkout abuse (429) and logs every attempt + price mismatch to `analytics_events` for the admin to inspect.
