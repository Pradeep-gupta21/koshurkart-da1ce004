

## Dynamic Pricing System — Implementation Plan

### Overview
Add demand-based dynamic pricing that adjusts product prices based on demand signals (views, sales, cart adds) and stock levels. Vendors see pricing suggestions; admins control the rules.

### 1. Database Migration

Add new columns to `products` table:
```sql
ALTER TABLE products ADD COLUMN base_price numeric;
ALTER TABLE products ADD COLUMN dynamic_price numeric;
ALTER TABLE products ADD COLUMN demand_score numeric DEFAULT 0;
```
- `base_price`: vendor's original price (backfilled from current `price`)
- `dynamic_price`: calculated price after applying demand/stock factors
- `demand_score`: computed from recent analytics events

Create a `pricing_rules` table for admin-configurable rules:
```sql
CREATE TABLE pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  high_demand_multiplier numeric NOT NULL DEFAULT 1.05,
  low_demand_multiplier numeric NOT NULL DEFAULT 0.95,
  low_stock_multiplier numeric NOT NULL DEFAULT 1.10,
  high_stock_multiplier numeric NOT NULL DEFAULT 0.90,
  max_increase_pct numeric NOT NULL DEFAULT 20,
  max_decrease_pct numeric NOT NULL DEFAULT 15,
  demand_threshold_high numeric NOT NULL DEFAULT 70,
  demand_threshold_low numeric NOT NULL DEFAULT 30,
  stock_threshold_high integer NOT NULL DEFAULT 100,
  stock_threshold_low integer NOT NULL DEFAULT 10,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```
RLS: admin-only for all operations, public SELECT for reading active rules.

Create a DB function `calculate_dynamic_prices()` that:
- Computes `demand_score` per product from recent `analytics_events` (views * 1 + cart * 3 + purchases * 5, last 7 days, normalized 0-100)
- Applies pricing multipliers based on active `pricing_rules`
- Updates `dynamic_price` on each product, clamped by max increase/decrease percentages
- Backfill `base_price` from `price` where null

### 2. Create `src/services/pricingService.ts`

Functions:
- `getDynamicPrice(productId)` — returns current dynamic price for a product
- `getPricingSuggestions(vendorId)` — returns products with suggested price changes and reasoning
- `getPricingRules()` — fetches active pricing rules (admin)
- `updatePricingRule(id, updates)` — updates a rule (admin)
- `createPricingRule(rule)` — creates a new rule (admin)
- `recalculatePrices()` — calls the DB function to recalculate all prices

### 3. Update Product Display

Modify `mapDbProduct` in `productService.ts` to include `basePrice`, `dynamicPrice`, `demandScore`.

Update `PriceDisplay` component to show dynamic price when available (use `dynamic_price` as the effective display price, show `base_price` as the reference).

### 4. Vendor Dashboard — Pricing Suggestions

Add a new "Pricing Insights" card to `VendorOverview.tsx`:
- Shows products with dynamic price suggestions
- Displays demand score, current price vs suggested price
- Reasoning labels: "High demand — price increase suggested", "Low stock — price increase suggested", etc.

### 5. Admin Panel — Pricing Rules Management

Add a new route `/admin/pricing` with `AdminPricing.tsx`:
- Table of pricing rules with edit capability
- Fields: multipliers, thresholds, max increase/decrease percentages
- Toggle rules active/inactive
- "Recalculate All Prices" button

Add nav item to `AdminDashboard.tsx`.

### 6. Scheduled Recalculation

Create an edge function `recalculate-prices` that calls `calculate_dynamic_prices()` — can be triggered manually or scheduled via pg_cron.

### Files
- **Migration**: Add columns to products, create pricing_rules table, create calculate_dynamic_prices function
- **Create**: `src/services/pricingService.ts`
- **Create**: `src/pages/admin/AdminPricing.tsx`
- **Create**: `supabase/functions/recalculate-prices/index.ts`
- **Modify**: `src/services/productService.ts` — map new fields
- **Modify**: `src/types/product.ts` — add basePrice, dynamicPrice, demandScore
- **Modify**: `src/components/product/PriceDisplay.tsx` — support dynamic price display
- **Modify**: `src/pages/vendor/VendorOverview.tsx` — add pricing suggestions card
- **Modify**: `src/pages/admin/AdminDashboard.tsx` — add pricing nav item
- **Modify**: `src/App.tsx` — add admin pricing route
- **Modify**: `src/services/index.ts` — export pricingService

