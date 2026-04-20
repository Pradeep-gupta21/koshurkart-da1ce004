
## Reality check

Most of this spec is already shipped. The stack is React + Vite + Tailwind + Lovable Cloud (Supabase) — Next.js/Express/Mongo/Cloudinary/S3 are not the stack of this project and are not on the table. JWT/sessions, RBAC, file storage, and Razorpay are already wired through Lovable Cloud and used in production paths.

| Spec ask | Status | Evidence |
|---|---|---|
| **Vendor registration** | ✅ | `VendorApplyPage` → `vendor_apply()` SECURITY DEFINER → creates `vendors` row + grants `vendor` role |
| **Admin approval workflow** | ✅ | `AdminVendors` with pending → verified/rejected/suspended + Verify badge toggle |
| **Vendor dashboard activation** | ⚠️ Partial | `RoleRoute` lets a vendor in as soon as the role is granted — even while `verification_status='pending'` or `'rejected'`/`'suspended'`. No status gate. |
| **Store management system** | ⚠️ Partial | `vendorService.update` exists for `store_name/description/logo`. No vendor-facing settings page wired into `/vendor`. |
| **JWT / session auth** | ✅ | Supabase Auth + RLS via `has_role()` |
| **File upload (logo / KYC docs)** | ⚠️ Partial | `product-images` and `review-images` buckets exist; **no `vendor-kyc` bucket**, no logo upload UI |
| **KYC verification** | ❌ | No KYC fields, no submission flow, no admin review UI |
| **Razorpay payments** | ✅ | Already integrated for orders (out of scope here) |
| **Notifications on approval/rejection** | ✅ approval | `on_vendor_verified_notify` trigger fires on `verification_status='approved'`. **No notification on rejected/suspended.** |

**Verdict:** Real gaps are KYC, status-gated vendor dashboard access, store-settings page, logo/KYC uploads, and rejection/suspension notifications. Everything else is duplication.

## Plan — ship the real gaps

### 1. KYC schema (migration)

Extend `vendors` with KYC columns (no new table needed — KYC is 1:1 with vendor):
- `business_name text`, `business_type text` (individual/proprietorship/pvt-ltd), `gstin text` (15-char India GSTIN, optional), `pan_number text` (10-char PAN, required), `aadhaar_last4 text` (last 4 only — never store full Aadhaar), `bank_account_holder text`, `bank_account_number_masked text` (only last 4 stored), `bank_ifsc text`, `kyc_status text` default `'not_submitted'` (`not_submitted | pending | approved | rejected`), `kyc_submitted_at timestamptz`, `kyc_reviewed_at timestamptz`, `kyc_rejection_reason text`, `kyc_doc_pan text` (storage path), `kyc_doc_address text` (storage path), `kyc_doc_business text` (storage path, optional).

**Storage**: create private bucket `vendor-kyc` with RLS — vendor can upload/read their own folder (`{user_id}/...`); admins can read any path; nobody else.

**Trigger**: extend `on_vendor_verified_notify` to also notify on `verification_status='rejected'` and `'suspended'`, and add a parallel `on_vendor_kyc_status_change` notifier when `kyc_status` flips to `approved` or `rejected`.

**Validation**: add a server-side trigger that enforces PAN regex `^[A-Z]{5}[0-9]{4}[A-Z]$`, GSTIN regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$` (when present), and IFSC regex `^[A-Z]{4}0[A-Z0-9]{6}$` on insert/update of `vendors` when KYC fields change.

### 2. Status-gated vendor dashboard (`RoleRoute` + new pending screen)

Add a thin `VendorStatusGate` wrapper inside the `/vendor` parent route that runs **after** `RoleRoute` passes. It reads `vendors.verification_status` and `kyc_status` for the current vendor and renders:
- `verification_status='pending'` → "Application under review" screen with KYC progress checklist and link to complete KYC if not submitted
- `verification_status='rejected'` → rejection screen with reason and a "Reapply" CTA
- `verification_status='suspended'` → suspension screen with support contact
- `verification_status='verified'` → render the dashboard children as today

Vendor dashboard is **not** accessible until verified. Vendor Apply page redirects to `/vendor/apply/kyc` after creating the vendor row if KYC is incomplete.

### 3. KYC submission flow

New page `src/pages/vendor/VendorKYCPage.tsx` (route `/vendor/apply/kyc`, gated by ProtectedRoute + must own a vendor row):
- Multi-step form (3 steps): Business details → Bank details → Document upload
- Uses `react-hook-form` + new Zod schema `src/lib/validators/kycSchema.ts` (PAN/GSTIN/IFSC regexes + length caps)
- Document uploads go through existing `imageCompression` (for image docs) → `vendor-kyc` bucket at `{user_id}/pan.jpg`, `{user_id}/address.jpg`, `{user_id}/business.jpg`
- Bank account number is captured client-side, stored as masked (`****1234`) only — never persisted in full
- On submit: updates `vendors` row, sets `kyc_status='pending'`, `kyc_submitted_at=now()`
- Progress saved per step in component state; on completion redirects to `/vendor/apply/pending`

### 4. Vendor store settings page

New page `src/pages/vendor/VendorSettings.tsx` (route `/vendor/settings`, only visible/usable when verified):
- Edit `store_name`, `description`, `logo` (upload to `product-images` bucket under `vendors/{vendor_id}/logo.*`)
- View KYC status (read-only) with "Resubmit KYC" button if rejected
- Add link in `DashboardSidebar` for vendors

### 5. Admin KYC review

Extend `AdminVendors`:
- New "KYC" filter tab counting `kyc_status='pending'`
- Expand each card: when `kyc_status='pending'`, show a "Review KYC" button that opens a Sheet with all KYC fields, signed URLs to the three docs (admin reads `vendor-kyc` directly), and Approve/Reject controls
- Reject requires a reason (textarea) — written to `kyc_rejection_reason`
- Approving KYC does **not** auto-approve the vendor — admin still clicks "Approve" on `verification_status` separately. (Two-step gate: KYC valid + manual vendor approval.)
- A new edge function is **not** needed — RLS already restricts updates to admins via `has_role()`.

### 6. Notification coverage

Migration extends notification triggers:
- `on_vendor_verified_notify` already fires on `approved`. Extend to fire on `rejected` and `suspended` with appropriate copy.
- New `on_vendor_kyc_status_change` trigger: notify vendor on `kyc_status='approved'` ("KYC verified — your application is now under final review") and `kyc_status='rejected'` ("KYC needs attention: {reason}").

### 7. Auth context tweak

Extend `useAuth` to expose `vendorStatus: 'pending' | 'verified' | 'rejected' | 'suspended' | null` and `kycStatus`, fetched alongside `vendorId`. The status gate and sidebar use these to render the right state without extra queries.

## Out of scope (intentional)

- Migrating to Next.js / Express / MongoDB / Cloudinary / S3 — incompatible with the stack
- Storing full Aadhaar / full bank account number — privacy/compliance risk; only last 4 captured
- Aadhaar OCR / DigiLocker / external KYC API integration — separate workstream; current flow is manual admin review (matches Amazon Seller Central early-stage pattern)
- Vendor onboarding email beyond the existing Supabase auth emails — separate "transactional emails" task
- Razorpay payouts to vendors — out of scope; existing `payouts` table + admin manual flow stays
- Webhooks for KYC providers — premature

## Files

**Create**
- `supabase/migrations/<ts>_vendor_kyc.sql` — vendors KYC columns, validation trigger, `vendor-kyc` private bucket + RLS, extended notification triggers
- `src/lib/validators/kycSchema.ts` — Zod schema (PAN/GSTIN/IFSC regex, business types enum, file size caps)
- `src/pages/vendor/VendorKYCPage.tsx` — 3-step KYC submission form with document upload
- `src/pages/vendor/VendorSettings.tsx` — store profile editor (name/desc/logo) + KYC status panel
- `src/components/auth/VendorStatusGate.tsx` — pending/rejected/suspended screens, wraps dashboard
- `src/components/vendor/KYCReviewSheet.tsx` — admin KYC review sheet with signed URLs + approve/reject

**Edit**
- `src/App.tsx` — add `/vendor/apply/kyc`, `/vendor/settings` routes; wrap `/vendor` element with `VendorStatusGate`
- `src/hooks/useAuth.tsx` — add `vendorStatus` + `kycStatus` to context
- `src/pages/VendorApplyPage.tsx` — after `vendor_apply()`, redirect to `/vendor/apply/kyc` instead of `/vendor`
- `src/pages/admin/AdminVendors.tsx` — KYC filter tab + per-row "Review KYC" entry point
- `src/components/navigation/DashboardSidebar.tsx` — add "Store Settings" link for vendors
- `src/services/vendorService.ts` — add `submitKYC`, `getKYC`, `approveKYC`, `rejectKYC`, `uploadKYCDocument`, `uploadLogo` helpers
