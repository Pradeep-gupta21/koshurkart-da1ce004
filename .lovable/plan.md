

## Vendor Earnings & Payout Approval — Implementation Plan

### Current State
- **`payouts` table** exists with all needed columns (vendor_id, amount, status, requested_at, processed_at)
- **`VendorPayments.tsx`** exists with cards and payout request button — but earnings use a fake formula (`total_sales * 25.5`) instead of real order revenue
- **RLS on payouts**: vendors can SELECT + INSERT own payouts, admins can SELECT — but admins **cannot UPDATE** (no approve/reject capability)
- **No admin payout management page** exists
- **No commission or ad spend** reflected in vendor earnings

### Plan

#### 1. Fix Vendor Earnings Calculation (`VendorPayments.tsx`)
- Query `order_items` for the vendor to compute **Total Sales** (sum of price × quantity)
- Calculate **Platform Commission** at 10%
- Query `ad_campaigns` for the vendor to compute **Ad Spend** (sum of budgets for approved campaigns)
- **Net Earnings** = Total Sales − Commission − Ad Spend
- **Withdrawable Balance** = Net Earnings − Paid Out − Pending Payouts
- Update the cards: Total Sales, Commission (10%), Ad Spend, Net Earnings, Withdrawable Balance

#### 2. Database Migration
- Add RLS policy: admins can UPDATE payouts (to change status and set processed_at)

#### 3. Create Admin Payouts Page (`/admin/payouts`)
- List all payouts joined with vendor store_name
- Filter tabs: Pending / Completed / Rejected / All
- Approve button → sets `status = 'completed'`, `processed_at = now()`
- Reject button → sets `status = 'rejected'`
- Add nav item to `AdminDashboard.tsx`

### Files
- **Modify**: `src/pages/vendor/VendorPayments.tsx` — real earnings with commission, ad spend, net
- **Create**: `src/pages/admin/AdminPayouts.tsx` — payout approval panel
- **Modify**: `src/pages/admin/AdminDashboard.tsx` — add Payouts nav
- **Modify**: `src/App.tsx` — add `/admin/payouts` route
- **Migration**: admin UPDATE policy on payouts

