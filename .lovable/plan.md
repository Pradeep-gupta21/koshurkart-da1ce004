

## Bidding-Based Ad Auction — Implementation Plan

### Current State
- `ad_campaigns` has `budget`, `daily_limit`, `impressions`, `clicks` — no bid amount, quality score, or effective score
- `ad_placements` has CPC/CPM pricing but no minimum bid
- Sponsored products are fetched by placement + status=approved, no ranking
- Vendor campaign form collects budget/daily limit but no bid
- Admin can approve/reject/pause campaigns but no bid rules

### Plan

#### 1. Database Migration
Add columns to `ad_campaigns`:
- `bid_amount NUMERIC NOT NULL DEFAULT 0.10`
- `quality_score NUMERIC DEFAULT 50`
- `effective_score NUMERIC DEFAULT 0`
- `conversions INTEGER DEFAULT 0`

Add column to `ad_placements`:
- `minimum_bid NUMERIC DEFAULT 0.01`

Create a DB function `recalculate_ad_quality_score(p_campaign_id UUID)` (security definer):
1. Calculate CTR from impressions/clicks
2. Calculate conversion rate from clicks/conversions
3. Fetch vendor trust_score from vendors table
4. `quality_score = 0.4 * (ctr * 1000, capped at 100) + 0.3 * (conv_rate * 100, capped at 100) + 0.3 * vendor_trust_score`
5. `effective_score = bid_amount * (quality_score / 100)`
6. Update the campaign row

Create a DB function `get_auction_winners(p_placement TEXT, p_limit INT DEFAULT 3)` that:
- Selects active approved campaigns for the placement where budget not exhausted
- Joins products and vendors
- Orders by `effective_score DESC`
- Returns top N

Update `track_ad_event` to call `recalculate_ad_quality_score` after incrementing impressions/clicks.

Add trigger on analytics_events for `purchase` events to increment `conversions` on matching campaigns and recalculate.

#### 2. Update Types (`src/types/ads.ts`)
Add `bidAmount`, `qualityScore`, `effectiveScore`, `conversions` to `AdCampaign`.
Add `minimumBid` to `AdPlacement`.

#### 3. Update Ad Service (`src/services/adService.ts`)
- Replace `getApprovedByPlacement` with `getAuctionWinners(placement, limit)` calling the RPC
- Add `getMinimumBid(placement)` helper

#### 4. Update Vendor Campaign Form & Page (`VendorCampaigns.tsx`)
- Add "Bid Amount" field to campaign creation form
- Show bid amount, quality score, effective score, conversions, and ad rank in campaign cards
- Add conversion rate metric to summary stats

#### 5. Update Homepage & Search (`HomePage.tsx`, `SearchPage.tsx`)
- Replace `adService.getApprovedByPlacement` calls with `adService.getAuctionWinners`
- Sponsored products now ranked by effective score (handled server-side)

#### 6. Update Admin Placements (`AdminPlacements.tsx`)
- Add "Minimum Bid" field per placement
- Show in the placement management UI

#### 7. Update Admin Campaigns (`AdminCampaigns.tsx`)
- Show bid amount, quality score, effective score columns
- Show ad rank position

### Files to Create/Modify
- **Migration**: Add columns, create `recalculate_ad_quality_score`, `get_auction_winners`, update `track_ad_event`, add conversion trigger
- **Modify**: `src/types/ads.ts` — extend interfaces
- **Modify**: `src/services/adService.ts` — auction winner RPC, minimum bid
- **Modify**: `src/pages/vendor/VendorCampaigns.tsx` — bid field, metrics display
- **Modify**: `src/pages/HomePage.tsx` — use auction winners
- **Modify**: `src/pages/SearchPage.tsx` — use auction winners
- **Modify**: `src/pages/admin/AdminPlacements.tsx` — minimum bid field
- **Modify**: `src/pages/admin/AdminCampaigns.tsx` — bid/quality/effective score display

