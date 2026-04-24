# Plan: Eliminate all "$" leakage and standardize on ₹ (INR)

## Findings

The system is already INR-only end-to-end:

- `src/services/currencyService.ts` — formats with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` → outputs `₹...`.
- `src/contexts/CurrencyContext.tsx` — exposes `formatPrice(amount)` everywhere via `useCurrency()`.
- Cart, Checkout, ProductCard, PriceDisplay all use `formatPrice` correctly.
- Backend (`create-checkout`, `create-razorpay-order`, UPI flows) already uses `currency: "INR"` and the shared paise helper. No `$` is sent from any edge function.

**The only real leaks are 4 frontend files** (admin/vendor dashboards + search slider) that build display strings with template literals like `` `$${value.toFixed(2)}` ``. Plus several places using the `DollarSign` lucide icon (visual dollar glyph).

## Files to change

### 1. Hardcoded "$" → `formatPrice`

| File | Lines | Change |
|---|---|---|
| `src/pages/vendor/VendorAnalytics.tsx` | 60, 239 | `` `$${totalRevenue.toFixed(2)}` `` → `formatPrice(totalRevenue)`; recharts `Tooltip formatter={(v) => `$${v.toFixed(2)}`}` → `formatPrice(v)` |
| `src/pages/vendor/VendorOverview.tsx` | 147, 148, 221 | Same pattern for Total Earnings, Withdrawable, and Tooltip formatter |
| `src/pages/admin/AdminOverview.tsx` | 127, 239 | Revenue stat + Tooltip formatter |
| `src/pages/vendor/VendorPayments.tsx` | 62 | `value: totalEarnings` (raw number) → wrap with `formatPrice` where rendered (verify render site) |
| `src/pages/vendor/VendorCampaigns.tsx` | 201 | `` `Bid: $${...}` `` → `` `Bid: ${formatPrice(Number(c.bid_amount ?? 0))}` `` |
| `src/pages/admin/AdminCampaigns.tsx` | 100 | Same as above |
| `src/pages/SearchPage.tsx` | 212 | Price-range slider label `` `$${priceRange[0]}` `` / `` `$${priceRange[1]}` `` → `formatPrice(...)` |

Each file will get `import { useCurrency } from "@/contexts/CurrencyContext";` and `const { formatPrice } = useCurrency();` if not already present.

### 2. Visual `DollarSign` icon → `IndianRupee`

Both are lucide-react icons. Swap in:

- `src/pages/vendor/VendorAnalytics.tsx`
- `src/pages/vendor/VendorOverview.tsx`
- `src/pages/vendor/VendorPayments.tsx`
- `src/pages/vendor/VendorCampaigns.tsx`
- `src/pages/admin/AdminOverview.tsx`
- `src/pages/admin/AdminCampaigns.tsx`
- `src/pages/admin/AdminSettings.tsx`
- `src/config/navigation.ts` (Dynamic Pricing nav item)
- `src/lib/iconRegistry.ts` — keep `dollar` / `dollar-sign` keys mapped to `IndianRupee` for backward compat, add `rupee` / `indian-rupee` keys.

### 3. Lint guard (production safety)

Add an ESLint `no-restricted-syntax` rule to `eslint.config.js` that flags template literals and string literals containing a literal `$` immediately followed by `{` referencing a price/amount/total/revenue/earnings/balance/bid identifier — practical heuristic: forbid the regex `/\$\$\{.*(price|amount|total|revenue|earnings|balance|bid|paise|inr)/i` in JSX/TS files under `src/`. This catches future regressions.

(Lightweight alternative: a one-line custom rule that disallows the substring `` `$${ `` followed within 60 chars by those keywords.)

### 4. No backend changes needed

Verified:
- `supabase/functions/create-razorpay-order/index.ts` already passes `currency: "INR"`.
- `supabase/functions/create-checkout/index.ts` uses shared `pricing.ts` (paise + INR, no symbol).
- `supabase/functions/_shared/pricing.ts` returns numbers, never strings.
- No edge function returns a `$` formatted string.

### 5. No changes needed to

- `currencyService.ts` / `CurrencyContext.tsx` — already correct, INR-only, uses `Intl.NumberFormat('en-IN')`.
- Cart, Checkout, ProductCard, PriceDisplay — already use `formatPrice`.
- `PricingDebugBox` — shows raw numbers + paise, no symbol issues.

## Out of scope

- Multi-currency switching (the service already exposes a stub `setCurrency` no-op; can be extended later without touching call sites because they all go through `formatPrice`).
- Email/invoice templates — none exist in the project yet.
- Renaming the existing `formatPrice` to `formatCurrency` — that would touch ~20 call sites for zero behavior change. Keep current name; it already does exactly what's requested (₹ + en-IN formatting).

## Verification after implementation

1. `rg -n "\\\$\\\$\\{" src/` returns zero matches in JSX/TS files (only legitimate shell/escape uses elsewhere).
2. `rg -n "DollarSign" src/` returns only the iconRegistry backward-compat alias.
3. Manual smoke: open `/admin`, `/vendor`, `/vendor/analytics`, `/vendor/payments`, `/search` — all monetary values render as `₹1,234.56`.

Approve and I'll implement.