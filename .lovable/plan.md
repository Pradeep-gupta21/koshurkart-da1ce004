

## Vendor Earnings Dashboard UI Enhancement

### What Changes

Redesign `VendorOverview.tsx` to be a comprehensive earnings-focused dashboard with charts, recent payments, and a polished modern layout.

### 1. Update `VendorOverview.tsx` — Full Redesign

**Stat Cards (top row, 4 columns):**
- Total Sales (count), Total Earnings ($), Withdrawable Balance ($), Active Products
- Each card with icon, value, and subtle gradient background accents

**Charts Section (2-column grid):**
- **Earnings Over Time** — AreaChart (Recharts) showing earnings by period, fetched from `payments` table grouped by `created_at` (last 30 days, aggregated daily)
- **Orders Over Time** — BarChart showing order count per day from `order_items` grouped by date

Data source: query `payments` (where vendor's order_items exist) and `order_items` for the vendor, group by date in JS.

**Recent Payments Card:**
- Fetch from `payments` table via order_items join (vendor's payments)
- Show amount, payment method, status badge (color-coded), date
- Limit to 5 most recent

**Recent Orders Card (already exists, polish it):**
- Add order date, status badge, better layout with product image thumbnail

**Keep existing sections:** Trust Score, Low Stock Alerts, Pricing Insights, Commission banner — but reorder for better flow: stats → charts → recent payments → recent orders → trust → alerts → pricing

### 2. Add Data Fetching

New queries in the component:
- `payments` joined through `order_items` for the vendor — already accessible via vendor RLS policy on payments
- Group payments by day for the earnings chart
- Group order_items by day for the orders chart

### Files to Modify
- **`src/pages/vendor/VendorOverview.tsx`** — major UI overhaul with Recharts charts, recent payments section, improved card design

No new files or database changes needed. Recharts is already installed and used in VendorAnalytics.

