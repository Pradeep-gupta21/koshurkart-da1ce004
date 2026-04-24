## Reality check — current trust gap

Today's checkout still trusts the client in three places, even after recent hardening:

| Layer | Current behavior | Risk |
|---|---|---|
| `orderService.create(userId, totalPrice)` | Client passes `totalPrice` from `CartContext` (sum of `product.discountPrice ?? product.price` held in React state) | Client could mutate state and create a ₹1 order for a ₹50,000 cart |
| `orderService.addItems(...)` | Client passes `price`, `quantity`, `vendor_id`, `image` per row | Same — line prices are client-supplied |
| `processPayment(userId, orderId, amount, method)` → `createPayment` insert | `payments.amount` = client `amount` | Even though `verify-razorpay-payment` now cross-checks against `payments.amount`, that row was seeded from the client. The whole chain (`payments.amount → Razorpay order amount → verification`) anchors on a number the user controlled. |
| `paymentService.processPayment` UPI branch | `amount` used to build `upi://...&am=${amount}` deeplink/QR | QR amount = client amount, not DB |
| `openRazorpayCheckout` | `amount: Math.round(totalPrice * 100)` passed to `Razorpay()` modal | Cosmetic (gateway uses `order_id` for the actual charge) but inconsistent |

`create-razorpay-order` is already correct (re-fetches `orders.total_amount` server-side). The fix below makes the **upstream** writes (`orders`, `order_items`, `payments`) equally trusted.

## Decision: a single backend endpoint owns the entire checkout

Replace the client-driven sequence (`reserveStock` → `orderService.create` → `addItems` → `processPayment`) with **one** edge function `create-checkout` that does the whole thing atomically with the service-role key. The client sends only:

```json
{
  "items": [{ "product_id": "...", "quantity": 2 }, ...],
  "payment_method": "razorpay" | "upi" | "cod",
  "shipping_pincode": "110001"
}
```

Server returns `{ orderId, paymentId, total, razorpayOrderId?, qrCodeUrl?, keyId? }`.

This collapses the trust surface to a single endpoint and makes "the price you pay = the DB price" structurally guaranteed.

## Plan

### 1. New edge function: `create-checkout`

`supabase/functions/create-checkout/index.ts`

Logic, all under service-role:

1. Validate JWT → `user.id`.
2. Validate body with Zod: `items[]` (1–50 items, each `{ product_id: uuid, quantity: int 1–99 }`), `payment_method ∈ {razorpay, upi, cod}`, `shipping_pincode` (6 digits).
3. **Fetch every product row** from DB by `id IN (...)`:
   - Reject if any product missing, `status != 'active'`, or insufficient `stock - reserved_stock`.
   - Compute server-side `unit_price = COALESCE(discount_price, dynamic_price, price)` per product. Never use client price.
4. **Reserve stock** atomically per item via existing `reserve_stock(product_id, quantity)` RPC. If any fails, release everything reserved so far and return 409.
5. Compute `total = SUM(unit_price * quantity)`. Reject if `total < 1` (Razorpay floor) or `total > 1_000_000` (sanity ceiling).
6. **Insert `orders`** with `total_amount = total`, `user_id`, `payment_status='pending'`, `order_status='processing'`.
7. **Insert `order_items`** rows with server-computed `price`, `vendor_id` (looked up from products table, not client), `title`, `image`.
8. **Idempotent payment row**: re-use any existing pending `payments` row for `(user_id, order_id)`; otherwise insert fresh with `amount = total`, commission fields from `platform_settings`.
9. Branch by `payment_method`:
   - **cod**: payment stays `pending`, order → `confirmed`, return `{ orderId, paymentId, total }`.
   - **upi**: build UPI deeplink with `am=${total}` (DB total, not client), generate QR URL, store on payment, return `{ orderId, paymentId, total, qrCodeUrl, merchantUpiId }`.
   - **razorpay**: call Razorpay `POST /v1/orders` with `amount = Math.round(total * 100)`, `currency: 'INR'`, store `razorpay_order_id` on payment, return `{ orderId, paymentId, total, razorpayOrderId, keyId }`.
10. On any failure mid-flow, release reserved stock and return structured error.

Register in `supabase/config.toml` with `verify_jwt = false` (we validate inside).

### 2. Deprecate the client-driven path

**`src/services/orderService.ts`** — keep read methods (`getUserOrders`, `getVendorOrderItems`, etc.) unchanged. Mark `create()` and `addItems()` deprecated; remove their callers (currently only `CheckoutPage.handlePlaceOrder` and the retry handler). RLS already prevents non-owner inserts, but we want one canonical write path.

**`src/services/paymentService.ts`** — add a thin wrapper:

```ts
async startCheckout(items, paymentMethod, pincode) {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { items, payment_method: paymentMethod, shipping_pincode: pincode }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { orderId, paymentId, total, razorpayOrderId?, qrCodeUrl?, keyId? }
}
```

Keep `processPayment` for the rare retry path on an existing order (it already re-fetches server-side via `create-razorpay-order`). Remove the client `amount` parameter from its signature in a follow-up; for now, retry calls it with the **server-returned** `total`, never the cart total.

### 3. Refactor `CheckoutPage.handlePlaceOrder`

Replace lines 170-254 with:

```ts
const itemsPayload = items.map(({ product, quantity }) => ({
  product_id: product.id,
  quantity,
}));

const result = await paymentService.startCheckout(
  itemsPayload,
  paymentMethod,
  shipping.zip
);

setOrderId(result.orderId);
setPendingOrderId(result.orderId);

// Branch on what the server returned:
if (result.qrCodeUrl) {
  setQrCodeUrl(result.qrCodeUrl);
  setUpiPaymentId(result.paymentId);
  setFlowState('upi_pending');
  return;
}
if (result.razorpayOrderId) {
  await openRazorpayCheckout(
    result.razorpayOrderId,
    result.keyId,
    { id: result.paymentId },
    result.orderId,
    /* reserved tracking now lives server-side; pass [] */ []
  );
  return;
}
// COD
clearCart();
setFlowState('success');
```

`openRazorpayCheckout` change: `amount: Math.round(result.total * 100)` instead of `totalPrice * 100`. This is cosmetic (gateway charges by `order_id`) but removes the last `totalPrice` reference from the payment flow.

Inventory reservation moves entirely server-side (no more `inventoryService.reserveStock` loop on the client). Confirm-stock-on-success and release-on-failure also move server-side, fired by the existing `on_payment_success` trigger path + the existing `sweep_stale_orders` cron for abandoned sessions.

### 4. UPI confirm/QR — already aligned after step 1

`confirm-upi-payment` doesn't need changes; it reads `payments.amount` (server-set in step 1.8) and updates status. The QR URL the user scans now mathematically equals `payments.amount` because both came from the same server-computed `total` in step 1.5–1.9.

### 5. Validation rollups

- Server-side: Zod on input, DB checks on stock + product status, `total >= 1` floor, `total <= 1_000_000` ceiling, currency hardcoded `INR`.
- DB-level: existing `products_price_min_inr CHECK (price >= 1)` constraint already in place; `payments_one_success_per_order` partial unique index prevents double-credit; `webhook_events` PK prevents replay.
- Razorpay verify (already correct): signature HMAC + `rpOrder.amount === Math.round(payments.amount * 100)` + `rpOrder.currency === 'INR'`.
- Webhook (already correct): same amount check + dedupe via `webhook_events.provider_event_id`.

### 6. Tests

- `supabase/functions/create-checkout/checkout_test.ts` — Deno tests for: happy path, client-supplied price ignored, out-of-stock rejection, sub-₹1 rejection, idempotent re-call returning the same `paymentId`.

## Files

**Create**
- `supabase/functions/create-checkout/index.ts` — single source of truth for orders + payments
- `supabase/functions/create-checkout/checkout_test.ts` — Deno unit tests

**Edit**
- `supabase/config.toml` — register `create-checkout` (`verify_jwt = false`)
- `src/services/paymentService.ts` — add `startCheckout()`; remove unused client `amount` reliance in retry
- `src/pages/CheckoutPage.tsx` — replace `handlePlaceOrder` + `handleRetryPayment` to use `startCheckout`; drop client-side `inventoryService.reserveStock` loops; pass `result.total` to Razorpay modal
- `src/services/orderService.ts` — JSDoc-deprecate `create()` and `addItems()` (keep until next refactor; no callers after the page change)

**No change**
- `supabase/functions/create-razorpay-order/index.ts` — still correct (re-fetches `orders.total_amount`); used as fallback by retry path
- `supabase/functions/verify-razorpay-payment/index.ts` — already cross-checks amount + currency
- `supabase/functions/razorpay-webhook/index.ts` — already deduped + amount-checked
- `supabase/functions/confirm-upi-payment/index.ts` — already user-authed + server-validated
- All trigger functions (`on_payment_success`, `on_order_refund_reverse_earnings`, `sweep_stale_orders`) — already wired to the right state transitions

## Out of scope (intentional)

- Multi-currency — INR-only is locked from the previous plan
- Quote/lock-price flow (Amazon-style price guarantee for X minutes) — current dynamic pricing recomputes via cron, not on each checkout call, so cart→checkout drift is small. Add later if needed.
- Address validation against `serviceable_pincodes` inside `create-checkout` — already enforced upstream by `useServiceability`; can be hardened later

## Expected outcome

```text
Client → POST create-checkout { items: [{product_id, qty}], method, pincode }
                ↓
Backend: validate → re-price from DB → reserve stock → insert order
       → insert order_items (server prices) → insert payment (amount=DB total)
       → branch on method, build Razorpay order / UPI QR with DB total
                ↓
Client receives { orderId, paymentId, total, razorpayOrderId | qrCodeUrl, keyId }
                ↓
Razorpay modal opens against razorpayOrderId (gateway charges by order, not by client amount)
                ↓
verify-razorpay-payment: HMAC OK + rpOrder.amount === payments.amount*100 → success
                ↓
on_payment_success trigger: credits vendor earnings, marks confirm_stock
```

The client never sees, computes, or transmits a price after this change. UI display of `formatPrice(totalPrice)` remains, but it's purely cosmetic — the server has the only number that matters.