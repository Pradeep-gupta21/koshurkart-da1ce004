

## Review Fraud Detection System — Implementation Plan

### Current State
- `reviews` table has basic fields (rating, comment, is_verified_purchase) but no fraud flags
- AdminReviews page has simple delete functionality only
- No automated fraud detection on review submission

### Plan

#### 1. Database Migration
Add columns to `reviews` table:
- `is_suspicious BOOLEAN DEFAULT false`
- `flagged_reason TEXT DEFAULT NULL`
- `moderation_status TEXT DEFAULT 'pending'` (pending | approved | rejected)

Create a `flag_suspicious_review()` trigger function on review INSERT that checks:
1. **Same-vendor spam**: User reviewed 3+ products from same vendor in 24 hours
2. **Too-fast review**: Review submitted < 1 minute after user's most recent purchase of that product
3. **New account spam**: Account < 7 days old and already posted 5+ five-star reviews

If any rule triggers, sets `is_suspicious = true` and `flagged_reason` to a description of which rule(s) fired.

Add RLS: admins can UPDATE reviews (for moderation_status changes).

#### 2. Update Review Type (`src/types/product.ts`)
Add `isSuspicious`, `flaggedReason`, `moderationStatus` to `Review` interface.

#### 3. Rebuild Admin Reviews Page (`AdminReviews.tsx`)
Replace current simple list with a tabbed moderation dashboard:
- **Suspicious** tab (filtered to `is_suspicious = true`, sorted newest first) — shown by default
- **All Reviews** tab
- Each review card shows: flagged reason badge, rating, user, product, date
- Admin actions per review: **Approve** (set moderation_status='approved', is_suspicious=false), **Remove** (delete), **Ban User** (delete all user's reviews + note), **Warn Vendor** (toast confirmation — placeholder action)
- Summary stats at top: total suspicious, pending moderation count

#### 4. Add Warning Indicators
- Suspicious review count badge on "Reviews" nav item in AdminDashboard sidebar
- Color-coded cards (amber border for suspicious, red for flagged_reason containing multiple rules)

### Files to Create/Modify
- **Migration**: Add columns to reviews, create trigger function, update RLS
- **Modify**: `src/types/product.ts` — extend Review interface
- **Modify**: `src/pages/admin/AdminReviews.tsx` — full moderation dashboard rebuild
- **Modify**: `src/pages/admin/AdminDashboard.tsx` — suspicious count badge on nav

