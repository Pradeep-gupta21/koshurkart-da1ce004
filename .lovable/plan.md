# Vendors column-level security

Goal: Prevent any non-owner / non-admin from reading KYC, bank, financial, and private contact fields on `public.vendors`. Today RLS allows `SELECT *` to everyone, exposing PII, bank details, balances, and audit reasons.

## Sensitive columns to lock down
- **KYC**: `kyc_status`, `kyc_doc_business`, `kyc_doc_address`, `kyc_doc_pan`, `kyc_submitted_at`, `kyc_reviewed_at`, `kyc_rejection_reason`, `pan_number`, `gstin`, `aadhaar_last4`, `business_type`, `business_name`
- **Bank**: `bank_account_holder`, `bank_account_number_masked`, `bank_ifsc`, `bank_verified`
- **Financial**: `total_earnings`, `withdrawable_balance`
- **Private contact / address**: `phone`, `phone_verified_at`, `pickup_address_line1`, `pickup_address_line2`, `pickup_pincode`
- **Internal moderation**: `verification_rejection_reason`

Public-safe columns remain readable: `id, user_id, store_name, store_slug, description, logo, banner, tagline, category, rating, review_rating, trust_score, is_verified, verification_status, pickup_city, pickup_state, pickup_country, delivery_rate, cancellation_rate, return_rate, total_sales, created_at`.

## Database changes (single migration)

1. `REVOKE SELECT (<sensitive cols>) ON public.vendors FROM anon, authenticated;` (service_role keeps full access).
2. Create SECURITY DEFINER RPCs returning full vendor row, gated in-function:
   - `get_my_vendor()` — returns the caller's own vendor row.
   - `get_vendor_admin(_vendor_id uuid)` — admin only (`has_role(auth.uid(),'admin')`); errors otherwise.
   - `list_vendors_admin(_search text, _status text, _limit int, _offset int)` — admin only; powers `AdminVendors`.
   - `get_vendor_financials(_vendor_id uuid)` — returns `total_earnings, withdrawable_balance, total_sales` for owner or admin.
3. `GRANT EXECUTE` of those RPCs to `authenticated` only.

## Frontend refactor (call sites swap from direct selects to RPCs)

- `src/hooks/useVendor.tsx` and `src/services/vendorService.ts#getVendor` → `supabase.rpc('get_my_vendor')`.
- `src/pages/admin/AdminVendors.tsx` (`select('*')`) → `supabase.rpc('list_vendors_admin', ...)` plus `get_vendor_admin` for the KYC review sheet.
- `src/components/vendor/KYCReviewSheet.tsx` (if reading sensitive cols) → use `get_vendor_admin`.
- `src/pages/vendor/VendorOverview.tsx`, `src/pages/vendor/VendorPayments.tsx`, `src/services/paymentService.ts` (lines reading `total_earnings`, `withdrawable_balance`, `total_sales`) → use `get_vendor_financials` or `get_my_vendor`.
- `src/pages/ProductDetailPage.tsx` (`select('*, profiles(name)')`) → narrow to public column allowlist (drop sensitive columns from the projection).
- `src/services/vendorService.ts#updateVendor` and KYC submit paths keep using direct `update` (UPDATE policy unchanged; column REVOKEs only affect SELECT).
- Calls that already select only public columns (ProductCard `is_verified`, AdminOverview count, analyticsService created_at, ProductDetailPage trust card) stay as-is.

## Verification
- Re-run security scan; confirm vendor exposure findings clear.
- Smoke test: owner can see own KYC/bank/financials in vendor dashboard; admin can see all in AdminVendors; anonymous storefront still loads vendor cards and product detail page; non-owner authenticated user querying another vendor's row gets only public columns.

## Out of scope
- `profiles` email/phone exposure (separate follow-up).
- Realtime channel auth.
- Generic Supabase linter warnings unrelated to this change.
