
## Reality check

Most of this multi-step vendor onboarding is already shipped — and split across two routes by design (registration vs KYC). Honest gap analysis:

| Spec step | Status | Evidence |
|---|---|---|
| **1. Basic Info** (name, email, phone) | ✅ partial | `AuthPage` collects name + email + password during signup → `profiles` table. **Phone + OTP not collected.** |
| **2. Business Details** (store name, type, category, description) | ⚠️ Split | `VendorApplyPage` collects `store_name` + `description`. `VendorKYCPage` step 1 collects `business_name` + `business_type`. **No category field.** |
| **3. Address** (pickup, pincode, city, state) | ❌ | Not collected during onboarding. `user_locations` exists for buyer addresses but no pickup address on `vendors`. |
| **4. KYC** (PAN, Aadhaar, bank) | ✅ | `VendorKYCPage` step 2 + 3 — shipped last loop. Bank account stored masked. |
| **5. Store Setup** (logo, banner, tagline) | ⚠️ Partial | `vendors.logo` column exists; logo upload only available in `VendorSettings` post-verification. **No banner column, no tagline column, not part of onboarding.** |
| **6. Review & Submit** | ❌ | No review step — KYC submits directly from step 3. |
| **Step progress indicator** | ⚠️ Basic | KYC has a `Stepper` component (numbered circles). Apply page has none. |
| **Auto-save progress** | ❌ | All form state is in-memory; refresh = lose everything. |
| **OTP phone verification** | ❌ | Not implemented anywhere. |

**Verdict:** Real, shippable gaps. But the spec also asks for things that conflict with how the app already works — calling those out before building:

**Conflicts with existing architecture (won't change):**
- Email + name are collected at **signup** (`AuthPage`), not vendor apply. Re-collecting them creates two sources of truth. Will pre-fill from `profiles` and let the user confirm.
- Password/auth is decoupled from vendor application. Vendors must be signed in to apply (matches Amazon Seller Central). Not changing.
- Phone OTP via Twilio/MSG91 requires a paid SMS provider + secret. Will use **Supabase Auth's built-in phone OTP** (already supported via `signInWithOtp({ phone })` — needs the user to enable a phone provider in backend settings) and gate Step 1 on successful verification. If the provider isn't enabled, fall back to a "verified" badge after the user clicks a "send code" button that no-ops (with a clear toast saying SMS is disabled in dev). I'll wire the code path; the user enables the provider when ready.
- KYC will remain on its own route post-application (`/vendor/apply/kyc`) because it requires an existing vendor row for `vendor-kyc` storage RLS (`{user_id}/...` path). The new wizard will hand off to KYC after step 3.

## Plan — unified premium onboarding wizard

### 1. Schema additions (migration)

Extend `vendors` with the missing onboarding fields:
- `category text` — primary store category (Electronics, Handicrafts, Apparel, Beauty, Home, Grocery, Other)
- `tagline text` — short store tagline (max 80 chars)
- `banner text` — banner image storage path
- `pickup_address_line1 text`, `pickup_address_line2 text`, `pickup_city text`, `pickup_state text`, `pickup_pincode text`, `pickup_country text default 'IN'`
- `phone text`, `phone_verified_at timestamptz` — phone with verification timestamp
- Validation trigger extension: `pickup_pincode` must match `^\d{6}$` when present; `phone` must match `^\+?[1-9]\d{9,14}$` when present

Add a `vendor_onboarding_drafts` table (1:1 with user_id) for auto-save:
- `user_id uuid pk references auth.users`
- `data jsonb not null default '{}'` — full wizard state
- `current_step int not null default 1`
- `updated_at timestamptz default now()`
- RLS: user can read/write their own row only

### 2. Wizard architecture

New page: `src/pages/VendorOnboardingPage.tsx` at route `/vendor/apply` (replaces current `VendorApplyPage`'s flow; old page becomes a thin redirect for back-compat).

Six steps in one component, each step is its own subcomponent under `src/components/vendor/onboarding/`:
- `Step1BasicInfo.tsx` — name (prefilled, editable), email (prefilled, read-only), phone + OTP
- `Step2BusinessDetails.tsx` — store name, store slug (auto-derived, editable), business type, category, description
- `Step3Address.tsx` — pickup address line 1/2, pincode (with city/state autofill via existing `serviceable_pincodes` lookup), city, state
- `Step4KYC.tsx` — PAN, GSTIN (optional), Aadhaar last 4, bank account holder/number/IFSC + 3 doc uploads (PAN, address, business)
- `Step5StoreSetup.tsx` — logo upload, banner upload, tagline
- `Step6Review.tsx` — summary cards for all data + confirm checkbox + submit

### 3. Premium UI components (reusable)

Create under `src/components/vendor/onboarding/`:
- `OnboardingShell.tsx` — fixed top bar with logo + progress, sticky bottom action bar (Back / Save & Exit / Next), centered scrollable content. Mobile: bottom bar collapses; progress becomes a thin horizontal line at top.
- `OnboardingStepper.tsx` — 6 numbered nodes with connecting line; completed=filled+check, current=ring+pulse, future=muted. Click jumps to any visited step. Mobile: collapses to "Step 3 of 6 · Address" with a thin progress bar.
- `OnboardingFieldGroup.tsx` — labeled section with optional helper text + icon, consistent spacing
- `FileDropzone.tsx` — drag-drop image uploader with preview, progress, remove (used for KYC docs, logo, banner; reuses existing `imageCompression`)
- `PhoneOtpInput.tsx` — phone input with country code, "Send code" button, 6-digit OTP input (uses existing `input-otp` UI component), resend timer, verified badge

### 4. Auto-save

A `useOnboardingDraft` hook:
- On wizard mount: fetch `vendor_onboarding_drafts` row for current user, hydrate form
- On every form change: debounce 800ms, upsert `data` + `current_step`
- On final submit: clear the draft row
- Visual indicator in the shell: "Saved" / "Saving…" with timestamp

### 5. Phone OTP flow

Use `supabase.auth.signInWithOtp({ phone })` to send code, `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` to verify. Since the user is already signed in via email, we **don't** want OTP to replace their session. Approach:
- Call `supabase.auth.updateUser({ phone })` first (which itself can trigger a verification SMS depending on provider config)
- On verification success, write `phone_verified_at = now()` to `vendors` row (or stage it in the draft until vendor row exists)
- If the SMS provider isn't configured, show a clear inline notice: "SMS verification is not enabled yet. Phone will be saved as unverified — admin can verify manually." Don't block submission.

### 6. Pincode → city/state autofill (Step 3)

On valid 6-digit entry, query `serviceable_pincodes` for matching `city` + `state`. If found, prefill (editable). If not, leave empty and show a subtle "We don't deliver to this pincode yet, but you can still register" note (vendors with non-serviceable pickup pincodes can still operate — they ship from elsewhere).

### 7. Step 4 → 5 → 6 wiring

- After Step 3, the wizard ensures a `vendors` row exists (calls `vendor_apply()` RPC) so KYC and storage uploads have a valid `user_id` folder
- Step 4 uploads to `vendor-kyc/{user_id}/...` (existing bucket + RLS)
- Step 5 uploads to `product-images/vendors/{vendor_id}/logo.*` and `.../banner.*` (existing public bucket)
- Step 6 final submit: writes all wizard data to `vendors`, sets `kyc_status='pending'`, deletes draft, redirects to `/vendor/apply/pending` (existing `VendorStatusGate` handles the rest)

### 8. Storage update for banner

Banner reuses the existing public `product-images` bucket under a `vendors/` prefix — no new bucket needed.

### 9. Back-compat

- Old `VendorApplyPage` becomes a redirect to `/vendor/apply` (the new wizard route)
- Old standalone `/vendor/apply/kyc` route stays for vendors who already have a vendor row but haven't completed KYC (rejected → resubmit flow)
- `VendorStatusGate`'s "Complete KYC" CTA points to the new wizard at the KYC step if onboarding is partially done, else to `/vendor/apply/kyc`

## Out of scope (intentional)

- Replacing Supabase Auth phone OTP with Twilio/MSG91 directly — the built-in path is the supported pattern; user enables a provider in backend settings when going live
- Re-collecting password / changing the auth model — vendors authenticate via the existing email/password flow before applying
- Per-step server-side validation endpoints — Zod runs client-side and the final write is constrained by the existing DB validation trigger
- Vendor email verification beyond Supabase's existing flow — already handled at signup
- Any rework of the admin KYC review — the new wizard writes to the same `vendors` columns, so `KYCReviewSheet` continues to work unchanged

## Files

**Migration**
- `supabase/migrations/<ts>_vendor_onboarding_v2.sql` — adds category/tagline/banner/pickup_*/phone columns to `vendors`, extends validation trigger, creates `vendor_onboarding_drafts` table + RLS

**Create**
- `src/pages/VendorOnboardingPage.tsx` — wizard root; routes/orchestrates 6 steps
- `src/components/vendor/onboarding/OnboardingShell.tsx`
- `src/components/vendor/onboarding/OnboardingStepper.tsx`
- `src/components/vendor/onboarding/OnboardingFieldGroup.tsx`
- `src/components/vendor/onboarding/FileDropzone.tsx`
- `src/components/vendor/onboarding/PhoneOtpInput.tsx`
- `src/components/vendor/onboarding/Step1BasicInfo.tsx`
- `src/components/vendor/onboarding/Step2BusinessDetails.tsx`
- `src/components/vendor/onboarding/Step3Address.tsx`
- `src/components/vendor/onboarding/Step4KYC.tsx`
- `src/components/vendor/onboarding/Step5StoreSetup.tsx`
- `src/components/vendor/onboarding/Step6Review.tsx`
- `src/hooks/useOnboardingDraft.ts` — fetch/hydrate/auto-save/clear
- `src/lib/validators/vendorOnboardingSchema.ts` — Zod schemas per step + combined

**Edit**
- `src/App.tsx` — `/vendor/apply` → `VendorOnboardingPage`; keep `/vendor/apply/kyc` for resubmit flow
- `src/pages/VendorApplyPage.tsx` — thin redirect to `/vendor/apply` (or remove + alias route)
- `src/services/vendorService.ts` — add `uploadBanner`, `getOnboardingDraft`, `saveOnboardingDraft`, `clearOnboardingDraft`, `lookupPincode` helpers
- `src/components/auth/VendorStatusGate.tsx` — point "Complete KYC" CTA at the unified wizard when applicable
- `src/integrations/supabase/types.ts` — auto-regenerated after migration
