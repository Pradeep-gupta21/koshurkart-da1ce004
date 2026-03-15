

## Native Advertising System — Implementation Plan

### Already Built
- **Ad campaign model** — `ad_campaigns` table has all fields (vendorId, productId, placement, budget, dailyLimit, impressions, clicks, startDate, endDate, status)
- **Ad placements table** — `ad_placements` with pricing config
- **Vendor campaign page** — `VendorCampaigns.tsx` with create form and campaign list
- **SponsoredProductCard** — exists with "SPONSORED" badge and accent ring
- **adService** — CRUD for campaigns
- **Admin approval flow** — campaigns default to `status = 'pending'`, admin has RLS access

### What Needs to Be Added

#### 1. Admin campaign management page (`/admin/campaigns`)
- List all campaigns with status filter tabs (Pending / Approved / Paused / All)
- Approve/reject buttons that update campaign status
- Show campaign details: product, vendor, budget, dates, impressions/clicks
- Add nav item to `AdminDashboard.tsx`

#### 2. Display sponsored ads on storefront
- **Homepage**: fetch approved campaigns with `placement = 'homepage'`, render as `SponsoredProductCard` carousel at top
- **SearchPage**: intersperse approved `placement = 'search'` campaigns into search results every N items
- **ProductDetailPage**: show `placement = 'product'` campaigns in a "Sponsored" suggestions section
- Track impressions: increment `impressions` count when ad is rendered (via a lightweight service call)

#### 3. Ad impression/click tracking
- Add `trackImpression(campaignId)` and `trackClick(campaignId)` to `adService`
- These call `UPDATE ad_campaigns SET impressions = impressions + 1` (or clicks)
- Fire impression on card mount, click on card click/link navigation
- Show CTR (clicks/impressions) in vendor campaign analytics

#### 4. Enhance vendor campaign analytics
- Add analytics cards to `VendorCampaigns.tsx`: total spend, total impressions, total clicks, average CTR
- Per-campaign: show CTR percentage, cost per click estimate

#### 5. Database migration
- Create a database function `track_ad_event(campaign_id uuid, event_type text)` as SECURITY DEFINER to safely increment impressions/clicks without requiring UPDATE RLS for anonymous users
- Add admin SELECT policy on `ad_campaigns` (already covered by existing policy)

### Files to Create/Modify
- **Create**: `src/pages/admin/AdminCampaigns.tsx` — admin campaign approval page
- **Modify**: `src/pages/admin/AdminDashboard.tsx` — add Campaigns nav item
- **Modify**: `src/App.tsx` — add `/admin/campaigns` route
- **Modify**: `src/services/adService.ts` — add tracking functions, fetch approved ads by placement
- **Modify**: `src/pages/HomePage.tsx` — render sponsored carousel from DB
- **Modify**: `src/pages/SearchPage.tsx` — intersperse sponsored results
- **Modify**: `src/pages/ProductDetailPage.tsx` — sponsored suggestions section
- **Modify**: `src/pages/vendor/VendorCampaigns.tsx` — add analytics summary cards
- **Migration**: `track_ad_event` function + public execution policy

