

## Vendor Earnings from Successful Payments — Implementation Plan

### What Changes

#### 1. Database Migration
Add two columns to `vendors`:
```sql
ALTER TABLE vendors ADD COLUMN total_earnings numeric DEFAULT 0;
ALTER TABLE vendors ADD COLUMN withdrawable_balance numeric DEFAULT 0;
```

Create a trigger on `payments` that fires when `payment_status` changes to `'success'`:
- Finds vendor(s) from the order's `order_items`
- Adds `vendor_earnings` from the payment to each vendor's `total_earnings` and `withdrawable_balance`
- Increments `total_sales` count on the vendor

#### 2. Update `src/pages/vendor/VendorOverview.tsx`
- Fetch `total_earnings`, `withdrawable_balance`, `total_sales` from vendors table
- Replace current stat cards with: **Total Sales**, **Total Earnings**, **Withdrawable Balance**, **Orders Completed**
- Add info banner: "Platform commission is currently 0%. Vendors receive 100% earnings."

#### 3. Update `src/pages/vendor/VendorPayments.tsx`
- Remove hardcoded `COMMISSION_RATE = 0.1`
- Use `calculateCommission` from `platformSettings` (commission = 0)
- Read `total_earnings` and `withdrawable_balance` from vendors table
- Update withdrawable balance after payout request
- Show the 0% commission message

#### 4. Update `src/services/paymentService.ts` — `getPayoutSummary`
- Use vendor's `total_earnings` and `withdrawable_balance` from DB instead of recalculating

### Files
- **Migration**: Add columns + trigger on payments
- **Modify**: `src/pages/vendor/VendorOverview.tsx`
- **Modify**: `src/pages/vendor/VendorPayments.tsx`
- **Modify**: `src/services/paymentService.ts`

