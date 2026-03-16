

## Complete Admin Panel — Implementation Plan

### What Already Exists
- **AdminOverview**: Users, vendors, orders, revenue, ad revenue, top vendors, suspicious clicks
- **AdminVendors**: Approve/reject pending vendors (no suspend for verified)
- **AdminCampaigns**: Approve/reject/pause campaigns (no placement pricing)
- **AdminPayouts**: Approve/reject payouts

### What's Missing

#### 1. Enhance AdminOverview — add total products metric
- Add products count query alongside existing stats
- Add "Total Products" card to the grid

#### 2. Vendor suspend capability (AdminVendors)
- Add "Suspend" button for verified vendors (sets status to `suspended`)
- Add "Reinstate" button for suspended vendors (sets back to `verified`)
- Add filter tabs (Pending / Verified / Suspended / All)

#### 3. Ad Placement Pricing Management
- New page `AdminPlacements.tsx` at `/admin/placements`
- List all `ad_placements` with editable `price_per_click` and `price_per_impression`
- Toggle `is_active` on/off
- Admin already has ALL policy on `ad_placements`

#### 4. Review Moderation Page
- New page `AdminReviews.tsx` at `/admin/reviews`
- List all reviews with product name, user name, rating, comment, date
- "Remove" button deletes fake/abusive reviews
- **Database migration**: Add admin DELETE policy on `reviews` table

#### 5. Fraud Alerts — Abnormal Purchase Patterns
- Enhance AdminOverview or create a dedicated fraud section
- Query for abnormal patterns: users with many purchases in short window, or duplicate orders
- Use a DB function `detect_abnormal_purchases()` that finds users with >5 orders in 1 hour
- Display alongside existing suspicious clicks

### Files to Create/Modify
- **Create**: `src/pages/admin/AdminPlacements.tsx` — placement pricing management
- **Create**: `src/pages/admin/AdminReviews.tsx` — review moderation
- **Modify**: `src/pages/admin/AdminOverview.tsx` — add products count, abnormal purchase alerts
- **Modify**: `src/pages/admin/AdminVendors.tsx` — add suspend/reinstate, filter tabs
- **Modify**: `src/pages/admin/AdminDashboard.tsx` — add nav items for Placements, Reviews
- **Modify**: `src/App.tsx` — add routes for placements, reviews
- **Migration**: Admin DELETE on reviews, `detect_abnormal_purchases` function

