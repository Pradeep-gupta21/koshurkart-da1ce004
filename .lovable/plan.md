
## Product Review & Feedback System

Build a production-quality review system with verified-purchase gating, image uploads, helpful voting, sorting, and a premium UI on the product detail page.

### Database Changes (migration)

**1. Extend `reviews` table:**
- `order_id uuid` — links review to specific order (proof of purchase)
- `images text[] default '{}'` — uploaded review images
- `helpful_count integer default 0` — denormalized for sorting
- Unique constraint on `(user_id, product_id)` — prevents duplicate reviews
- Index on `(product_id, created_at)` and `(product_id, helpful_count)` for sorting

**2. New `review_helpful_votes` table:**
- `review_id`, `user_id`, `created_at`
- Unique `(review_id, user_id)` — one vote per user per review
- RLS: users insert/delete own votes; anyone reads
- Trigger: increments/decrements `reviews.helpful_count` on insert/delete

**3. New `can_review_product(_user_id, _product_id)` SECURITY DEFINER function:**
- Returns the most recent `delivered` order_id where user purchased that product, or NULL
- Used both client-side (gating UI) and as RLS check

**4. Update RLS on `reviews`:**
- INSERT policy: requires `order_id IS NOT NULL` AND `can_review_product(auth.uid(), product_id) = order_id` AND `user_id = auth.uid()`
- Auto-set `is_verified_purchase = true` since gating ensures it

**5. Storage bucket `review-images`:**
- Public read; authenticated upload to own folder `{user_id}/...`
- 5MB per file, image/* only

**6. Trigger to update product `rating` and `review_count`:**
- After insert/update/delete on `reviews` (where `moderation_status = 'approved'`), recompute `AVG(rating)` and `COUNT(*)` on the product row

### Frontend Components

**`src/lib/imageCompression.ts`** — Canvas-based compression (max 1600px, JPEG quality 0.8) before upload. No new dependencies.

**`src/services/reviewService.ts`** — Centralized API:
- `getReviews(productId, { sort, withImagesOnly, limit, offset })` — paginated, sortable
- `getReviewSummary(productId)` — avg, total, distribution {5★: n, 4★: n, ...}
- `canReview(productId)` — calls `can_review_product` RPC
- `submitReview({ productId, orderId, rating, comment, images })` — uploads images then inserts
- `toggleHelpful(reviewId)` — insert/delete vote

**`src/components/reviews/ReviewSummary.tsx`** — Big avg rating, star bar distribution (Amazon-style horizontal bars per star level).

**`src/components/reviews/ReviewCard.tsx`** — User avatar/name, stars, date, "Verified Purchase" badge, comment, image thumbnails (click to enlarge in Dialog), Helpful button with count.

**`src/components/reviews/ReviewImageGallery.tsx`** — Grid of thumbnails; lightbox via existing `Dialog` component with prev/next navigation.

**`src/components/reviews/ReviewForm.tsx`** — Star picker (hover preview), textarea (max 2000 chars with counter), drag-drop image uploader (max 6 images, compressed client-side, preview thumbnails with remove), submit button. Uses `react-hook-form` + existing `reviewSchema` (extended with `images` and `orderId`).

**`src/components/reviews/ReviewSection.tsx`** — Orchestrates everything on the product page:
- Header: ReviewSummary + "Write a Review" button (disabled with tooltip if not eligible)
- Sort tabs: Top (helpful_count desc) / Latest (created_at desc) / With Images (images != '{}')
- Infinite scroll list of ReviewCards using `useInfiniteQuery` (10 per page) — lazy loading
- Inline ReviewForm in a Dialog when triggered
- Empty state, loading skeletons

### Product Detail Page Update
Replace the existing inline reviews section in `ProductDetailPage.tsx` (lines 280-313) with `<ReviewSection productId={product.id} />`.

### UX Details
- Premium card layout: rounded-xl, soft shadow, hover lift, smooth fade-in
- Star picker: large clickable stars with hover preview
- "Top Reviews" badge on reviews with helpful_count ≥ 5
- Image thumbnails: aspect-square rounded-lg, hover zoom
- Mobile: single column, larger touch targets, bottom-sheet form on small screens
- Gating UI: 
  - Not logged in → "Sign in to review"
  - Logged in but no delivered order → "Only customers who received this product can review"
  - Already reviewed → "You've already reviewed this product"
  - Eligible → primary "Write a Review" CTA

### Files to Create
- `supabase/migrations/<timestamp>_review_system.sql`
- `src/lib/imageCompression.ts`
- `src/services/reviewService.ts`
- `src/components/reviews/ReviewSummary.tsx`
- `src/components/reviews/ReviewCard.tsx`
- `src/components/reviews/ReviewImageGallery.tsx`
- `src/components/reviews/ReviewForm.tsx`
- `src/components/reviews/ReviewSection.tsx`

### Files to Modify
- `src/lib/validators/reviewSchema.ts` — add `orderId`, `images`
- `src/types/product.ts` — add `images`, `helpfulCount`, `orderId` to `Review`
- `src/pages/ProductDetailPage.tsx` — replace inline reviews with `<ReviewSection />`

### Out of scope (not requested)
- Vendor/admin replies to reviews (admin moderation already exists)
- Edit/delete own review UI (can be added later)

<lov-actions>
<lov-suggestion message="Test the full review flow end-to-end: place an order, mark it delivered, submit a review with images, and verify it appears with the Verified badge and image gallery">Verify it works end-to-end</lov-suggestion>
<lov-suggestion message="Add the ability for users to edit or delete their own reviews from the product page">Allow edit/delete own reviews</lov-suggestion>
<lov-suggestion message="Add a 'Vendor Response' feature so vendors can publicly reply to reviews on their products">Add vendor responses</lov-suggestion>
<lov-suggestion message="Add a 'My Reviews' tab on the profile page where users can see and manage all reviews they've written">My Reviews page</lov-suggestion>
</lov-actions>
