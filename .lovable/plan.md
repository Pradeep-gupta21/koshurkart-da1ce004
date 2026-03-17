

## Advanced Analytics Dashboards — Implementation Plan

### Current State
- `recharts` is already installed
- VendorAnalytics shows stat cards + top products list — no charts, no time filters
- AdminOverview shows stat cards + tables — no charts, no time filters
- `analyticsService` fetches raw data but doesn't support time-range filtering or chart-ready time-series data

### Plan

#### 1. Extend Analytics Service (`src/services/analyticsService.ts`)

Add time-filtered, chart-ready data methods:

**`getVendorChartData(vendorId, range: 'daily'|'weekly'|'monthly'|'yearly')`**
- Fetch orders + analytics_events for vendor's products within the range
- Return time-series arrays: `{ date, sales, views, adClicks, adImpressions }[]`
- Return top products by revenue, category breakdown, conversion rate over time

**`getAdminChartData(range)`**
- Fetch orders, analytics_events, ad_campaigns, vendors within range
- Return time-series: `{ date, revenue, orders, newVendors }[]`
- Return category performance, vendor growth over time, ad revenue breakdown

Both methods compute date buckets client-side from filtered queries (filter by `created_at >= rangeStart`).

#### 2. Rebuild Vendor Analytics (`src/pages/vendor/VendorAnalytics.tsx`)

- Add time range selector (daily/weekly/monthly/yearly tabs)
- **Sales Chart**: Line/Area chart showing revenue over time
- **Product Views Chart**: Bar chart of views over time
- **Conversion Funnel**: Views → Ad Clicks → Purchases as a bar chart
- **Ad Campaign Performance**: Bar chart per campaign (impressions, clicks, conversions)
- **Top Selling Products**: Horizontal bar chart (top 5 by revenue)
- Keep existing stat cards at top

#### 3. Rebuild Admin Overview (`src/pages/admin/AdminOverview.tsx`)

- Add time range selector
- **Revenue Chart**: Area chart of platform revenue over time
- **Ad Revenue Chart**: Line chart of ad budget/spend over time
- **Vendor Growth**: Line chart of new vendors over time
- **Top Categories**: Pie/bar chart of sales by product category
- **Suspicious Activity**: Keep existing tables, add trend line of suspicious events
- Keep existing stat cards + tables

#### 4. Create Shared Chart Components

Create `src/components/analytics/` with:
- `TimeRangeSelector.tsx` — tabs for daily/weekly/monthly/yearly
- `SalesChart.tsx`, `RevenueChart.tsx` — reusable Recharts wrappers with consistent styling

### Files to Create/Modify
- **Create**: `src/components/analytics/TimeRangeSelector.tsx`
- **Modify**: `src/services/analyticsService.ts` — add chart data methods with time filtering
- **Modify**: `src/pages/vendor/VendorAnalytics.tsx` — add charts + time filter
- **Modify**: `src/pages/admin/AdminOverview.tsx` — add charts + time filter

No database changes needed — all data already exists in orders, products, analytics_events, ad_campaigns, and vendors tables.

