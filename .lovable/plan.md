

## Analytics & Fraud Detection — Implementation Plan

### What's Needed

1. **New `analytics_events` table** to store granular events (product_view, ad_view, ad_click, purchase) with user_id, session context, and timestamps
2. **Fraud detection** via a database function that flags users clicking the same ad >10 times in a short window
3. **Enhanced vendor analytics** showing product views, ad metrics, conversion rate, and sales growth
4. **Enhanced admin analytics** showing platform revenue, ad revenue, top vendors, and suspicious click alerts

### Plan

#### 1. Database Migration
- Create `analytics_events` table:
  - `id uuid`, `event_type text` (product_view, ad_view, ad_click, purchase), `user_id uuid` (nullable for anonymous), `product_id uuid`, `campaign_id uuid`, `metadata jsonb`, `created_at timestamptz`
- RLS: authenticated users INSERT own events, anon users INSERT with null user_id, admins SELECT all, vendors SELECT events for their products
- Create `suspicious_clicks` table: `id`, `user_id`, `campaign_id`, `click_count`, `window_start`, `flagged_at`
- Create security-definer function `record_analytics_event(event_type, product_id, campaign_id, metadata)` that inserts the event AND checks fraud: if user has >10 ad_click events for same campaign_id in last 1 hour, insert into `suspicious_clicks`
- Enable realtime on `suspicious_clicks` for admin dashboard

#### 2. Analytics Service (`analyticsService.ts`)
- `trackEvent(type, productId?, campaignId?, metadata?)` — calls `record_analytics_event` RPC
- `getVendorAnalytics(vendorId)` — queries analytics_events for vendor's products: views, ad impressions, clicks, conversion rate, sales growth (compare last 30 days vs prior 30)
- `getAdminAnalytics()` — platform revenue (from orders), ad revenue (from campaigns budget), top vendors (by order_items revenue), suspicious click count
- `getSuspiciousClicks()` — admin-only query on suspicious_clicks table

#### 3. Integrate Tracking into Storefront
- **ProductDetailPage**: call `trackEvent('product_view', productId)` on mount
- **SponsoredProductCard**: replace direct `adService.trackImpression/Click` with `analyticsService.trackEvent('ad_view'/'ad_click', productId, campaignId)` (keep the existing RPC for backward compat, just add analytics event too)
- **CheckoutPage**: call `trackEvent('purchase', productId)` for each item on order confirmation

#### 4. Vendor Analytics Dashboard (`VendorAnalytics.tsx`)
- Add cards: Product Views, Ad Impressions, Ad Clicks, Conversion Rate (clicks→purchases), Sales Growth %
- Query analytics_events grouped by event_type for vendor's products

#### 5. Admin Analytics Dashboard (`AdminOverview.tsx`)
- Add sections: Total Platform Revenue, Ad Revenue (sum of campaign budgets for approved campaigns), Top 5 Vendors by revenue, Suspicious Click Alerts count with link to details
- New component or section showing flagged suspicious clicks with user/campaign details

### Files to Create/Modify
- **Migration**: `analytics_events` table, `suspicious_clicks` table, `record_analytics_event` function, RLS policies
- **Modify**: `src/services/analyticsService.ts` — full rewrite with tracking + dashboard queries
- **Modify**: `src/pages/ProductDetailPage.tsx` — track product_view
- **Modify**: `src/components/product/SponsoredProductCard.tsx` — track ad_view/ad_click via analytics
- **Modify**: `src/pages/CheckoutPage.tsx` — track purchase events
- **Modify**: `src/pages/vendor/VendorAnalytics.tsx` — add views, ad metrics, conversion, growth
- **Modify**: `src/pages/admin/AdminOverview.tsx` — add ad revenue, top vendors, suspicious clicks

