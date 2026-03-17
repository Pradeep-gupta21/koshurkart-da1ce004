

## Multi-Region & Currency Support — Implementation Plan

### Overview
Add a currency context that detects user location via a free geolocation API, stores currency preference, and converts all prices dynamically. A currency selector in the header lets users override. All price displays update automatically.

### 1. Create `src/services/currencyService.ts`

- **Supported currencies**: USD, EUR, GBP, CAD, AUD, JPY, INR, BRL, NGN (expandable)
- **Exchange rates**: Static rates object with USD as base (avoids external API dependency). Easy to swap for a live API later.
- `convertPrice(amount, fromCurrency, toCurrency)` — converts using rate table
- `formatPrice(amount, currency)` — uses `Intl.NumberFormat` for locale-aware formatting (e.g., $10.00, €10,00, ₹800.00)
- `detectUserCurrency()` — calls a free geolocation API (`https://ipapi.co/json/`) to get country, maps country to default currency
- `getCurrencySymbol(currency)` — returns symbol for display
- Country-to-currency mapping object

### 2. Create `src/contexts/CurrencyContext.tsx`

- Stores: `currency` (current), `country` (detected), `rates`, `isLoading`
- On mount: detect location → set default currency (fallback: USD)
- `convertPrice(amount)` — converts from USD (base) to user's currency
- `formatPrice(amount)` — converts + formats
- `setCurrency(code)` — manual override, persisted to localStorage
- All children re-render when currency changes

### 3. Update `src/components/product/PriceDisplay.tsx`

- Use `useCurrency()` hook to convert and format all prices
- Replace hardcoded `$` with `formatPrice()` output
- Dynamic price labels and savings still work the same way

### 4. Add Currency Selector to Header

- Small dropdown in the top bar (next to "Sell on Nexus" / "Admin" links)
- Shows current currency code + flag emoji
- Dropdown lists supported currencies

### 5. Update Cart Context

- `totalPrice` should use the currency context for display
- Cart stores prices in USD internally, converts on display

### 6. Update Profile Table (Optional)

- Add `country` and `preferred_currency` columns to `profiles` table
- Save authenticated user's currency preference to their profile
- Load on login so preference persists across devices

### Files to Create/Modify

- **Create**: `src/services/currencyService.ts`
- **Create**: `src/contexts/CurrencyContext.tsx`
- **Migration**: Add `country` and `preferred_currency` to profiles table
- **Modify**: `src/components/product/PriceDisplay.tsx` — use currency formatting
- **Modify**: `src/components/layout/Header.tsx` — add currency selector
- **Modify**: `src/App.tsx` — wrap with CurrencyProvider
- **Modify**: `src/contexts/CartContext.tsx` — currency-aware total display
- **Modify**: `src/pages/CartPage.tsx` — format prices with currency
- **Modify**: `src/pages/CheckoutPage.tsx` — format prices with currency
- **Modify**: `src/components/product/ProductCard.tsx` — use PriceDisplay consistently

