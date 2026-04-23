

## Reality check — root cause

The mismatch isn't a Razorpay bug; it's a **currency unit mismatch** baked into the app:

| Layer | Unit today | Problem |
|---|---|---|
| `products.price` (DB) | **USD** (e.g. `0.053`, `4.99`) | Stored as USD per `currencyService` exchange table |
| `PriceDisplay` UI | Converts USD → user's currency for display via `formatPrice` (×83.1 for INR) | UI shows ₹4.40 for a product whose DB price is `0.053` |
| `CartContext.totalPrice` | **USD** (raw `product.price` sum) | Never converted |
| `orders.total_amount` | **USD** | Saved as USD |
| `create-razorpay-order` edge fn | Reads `orders.total_amount`, multiplies ×100, sends as **INR paise** | Sends `5 paise` (≈₹0.05) for a product the user saw as ₹4.40 → fails Razorpay min ₹1 |
| UPI deeplink `am=${amount}` | USD value passed verbatim, currency hardcoded `INR` | User sees ₹4.40 on UI, UPI app shows ₹0.05 |

So the headline bug "UI ₹X but Razorpay charges ₹Y" is a **direct consequence of dual-unit storage**. There is no actual conversion at checkout — the USD number is reinterpreted as INR by the gateway.

## Decision: rupees as single source of truth

We will **not** introduce paise as the storage unit. Reasons:
- Every `numeric` price column already tolerates decimals; switching to integer paise means migrating ~10 columns across `products`, `orders`, `payments`, `payouts`, `vendors.total_earnings`, `vendors.withdrawable_balance`, `ad_campaigns.budget`, `pricing_rules` thresholds, etc., plus every trigger that reads them. High blast radius for zero functional gain — `numeric(12,2)` has no float precision issue.
- Razorpay needs paise only at the API boundary; `Math.round(amount * 100)` is the only place paise should appear, and it already exists in the edge function.

We **will** convert all stored values from USD to INR (one-shot multiply by 83.1, rounded to 2 dp) and lock the app to INR end-to-end. After this, "the price you see is the price you pay" is structurally true.

## Plan

### 1. Database — convert existing data USD → INR (one-shot)

Migration (data update only, no schema changes):

```sql
-- Products
UPDATE public.products
SET price          = ROUND(price * 83.1, 2),
    discount_price = CASE WHEN discount_price IS NOT NULL THEN ROUND(discount_price * 83.1, 2) END,
    base_price     = CASE WHEN base_price     IS NOT NULL THEN ROUND(base_price     * 83.1, 2) END,
    dynamic_price  = CASE WHEN dynamic_price  IS NOT NULL THEN ROUND(dynamic_price  * 83.1, 2) END
WHERE price < 100;  -- guard: don't double-convert rows already in INR (e.g. the ₹100 floor we set earlier)

-- Future-proof: enforce a minimum price of ₹1 so Razorpay never rejects
ALTER TABLE public.products ADD CONSTRAINT products_price_min_inr CHECK (price >= 1);
```

Orders / payments / vendor balances are left alone — historical records stay in their original unit; only forward-going writes will be INR (since UI now sends INR).

### 2. Frontend — INR everywhere, no conversion

**`src/services/currencyService.ts`**
- Reduce `CURRENCIES` to **INR only**.
- Remove `EXCHANGE_RATES` and `convertPrice` (or make it a no-op identity that asserts `from === to === 'INR'`).
- `detectUserCurrency` always returns `{ country: 'IN', currency: 'INR' }`.
- `formatPrice` becomes a thin wrapper around `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })`.

**`src/contexts/CurrencyContext.tsx`**
- Hard-default to `'INR'`. Remove the localStorage read (or keep as a cosmetic no-op).
- `convertPrice` returns the input unchanged.
- `formatPrice` delegates to `currencyService.formatPrice(amount, 'INR')`.

**`src/components/product/PriceDisplay.tsx`**
- No code change needed — it already calls `formatPrice(price)`. After the context change, it will format the raw INR price as `₹X.XX` with no conversion.

**Removals of stray currency references**
- Delete the currency switcher UI if any (search for `setCurrency` callers; remove dropdowns).
- `paymentService.processPayment` already hard-codes `currency: 'INR'` for Razorpay — leaves as is.
- UPI deeplink `am=${amount}` is now a real INR rupee value — correct.

### 3. Backend — already correct, just one guard

`create-razorpay-order/index.ts` already:
- Re-fetches `orders.total_amount` server-side (no client trust).
- Multiplies ×100 to get paise.
- Hard-codes currency `INR`.
- Has the `< 100 paise` (₹1) minimum check.

After the migration above, `orders.total_amount` written by future checkouts will be in INR (because `CartContext.totalPrice` will now be INR). No edge function changes needed.

`verify-razorpay-payment` and `razorpay-webhook` already cross-check the gateway amount against `payments.amount` (also a future-INR value) — works correctly post-migration.

### 4. Validation safeguards

- DB CHECK constraint `products.price >= 1` (above) prevents the ₹0.05 class of bug from ever recurring.
- Add a server-side floor in `orderService.create`: if `total_amount < 1`, reject. Belt-and-suspenders against an empty cart bug.

## Out of scope (intentional)

- **Multi-currency / international buyers** — current product memory is "Kashmir-focused India marketplace"; INR-only matches the business. If multi-currency comes back later, the right architecture is: store base-INR, convert at display time only, always charge INR (or add a true multi-PSP layer). Not building speculatively.
- **Paise-as-integer storage** — no precision benefit at this scale; large blast radius. Skipped.
- **Historical USD orders/payments rewriting** — left alone; analytics dashboards for old data may show small numbers, but no live flow reads them for payment.

## Files

**Migration**
- `<ts>_inr_currency_normalization.sql` — convert product prices USD→INR (guarded), add `products_price_min_inr` CHECK

**Edit**
- `src/services/currencyService.ts` — INR-only, remove exchange logic
- `src/contexts/CurrencyContext.tsx` — hard-default INR, identity convert
- `src/services/orderService.ts` — reject `total_amount < 1` in `create`

**No change needed**
- `src/components/product/PriceDisplay.tsx`, `src/contexts/CartContext.tsx`, `supabase/functions/create-razorpay-order/index.ts`, `verify-razorpay-payment`, `razorpay-webhook`

## Expected outcome

- Product DB price `4.99` → UI shows `₹4.99` → cart total `₹4.99` → `orders.total_amount = 4.99` → edge function sends `499 paise` → Razorpay charges `₹4.99` → webhook verifies `499 paise == 4.99 × 100` → success.
- One number, one unit, end-to-end. No more UI/payment mismatch.

