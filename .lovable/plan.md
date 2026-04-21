
## Reality check

In-app notifications already fire on vendor verification + KYC status change via DB triggers (`on_vendor_verified_notify`, `on_vendor_kyc_status_change`). The gap is **branded email notifications** to the vendor's inbox when an admin approves/rejects/suspends them.

Email requires a verified sender domain — none is configured yet. **You need to set up an email domain first** (one-time DNS setup); after that, I'll build everything else end-to-end without further input from you.

## Plan

### 1. Email domain setup (one-time, you do this)

Open the setup dialog and follow the prompts. DNS verification can take up to 72 hours but I can build and deploy everything before it finishes — emails just queue until DNS is live.

### 2. Email infrastructure + 3 transactional templates (I build)

Scaffold Lovable's email infrastructure, then create three branded React Email templates under `supabase/functions/_shared/transactional-email-templates/`:

- **`vendor-approved.tsx`** — "You're verified! Start selling on [Site]" with CTA → `/vendor` dashboard
- **`vendor-rejected.tsx`** — "Update on your vendor application" with rejection reason + CTA → `/vendor/apply` to reapply
- **`vendor-suspended.tsx`** — "Your vendor account has been suspended" with reason + support contact

All three styled to match the project's premium minimalist look (deep indigo primary, rounded cards, white email body per spec). `templateData` carries `storeName`, `reason` (for rejected/suspended), and the dashboard/apply URL.

Register all three in `_shared/transactional-email-templates/registry.ts`.

### 3. Trigger emails from the existing DB-trigger flow

Two options for invoking `send-transactional-email`:

- **Option A (chosen):** Extend the existing `vendorService.updateVerificationStatus(vendorId, status, reason?)` to call `supabase.functions.invoke('send-transactional-email', ...)` after a successful update. Looks up vendor email from `profiles`, picks the right template based on the new status, passes `reason` for rejected/suspended. Idempotency key: `vendor-status-${vendor_id}-${status}`.
- Skipped: DB-trigger → pg_net path. Adds infra, no benefit since admin actions always go through the service layer.

Same hook added to `setBankVerified` is **out of scope** — bank verification is internal admin bookkeeping, not a vendor-facing event.

### 4. KYC status change emails

KYC approve/reject is a separate admin action also routed through `vendorService` (`approveKYC`, `rejectKYC` if present, else direct table update in `KYCReviewSheet`). Adding two more templates would dilute the inbox; instead, **piggyback on the existing three**:

- KYC approved + verification still pending → no email (admin will approve verification next, which sends the approval email)
- KYC rejected → reuse `vendor-rejected.tsx` template with the KYC rejection reason and a CTA pointing to `/vendor/apply/kyc` (resubmit flow)

This keeps the surface to 3 templates and matches what vendors actually need to act on.

### 5. Audit log captures emails sent

`vendor_audit_log` already records who/when/why. Add an optional `metadata.email_sent: true|false` field set by the service layer based on the `invoke` result so admins can confirm the vendor was notified.

## Out of scope (intentional)

- **SMS notifications** — needs Twilio/MSG91 secret + per-message cost; flag separately if you want it
- **Vendor-customizable email preferences** — not requested; unsubscribe footer auto-appended by Lovable email infra covers compliance
- **Admin notification when a vendor reapplies** — different workstream (admin email digest); not in the spec
- **Editing the existing in-app notification triggers** — they keep firing alongside the new emails (vendors see both)

## Files

**Create**
- `supabase/functions/_shared/transactional-email-templates/vendor-approved.tsx`
- `supabase/functions/_shared/transactional-email-templates/vendor-rejected.tsx`
- `supabase/functions/_shared/transactional-email-templates/vendor-suspended.tsx`
- (auto-created by scaffolding) `supabase/functions/send-transactional-email/`, `handle-email-unsubscribe/`, `handle-email-suppression/`, `_shared/transactional-email-templates/registry.ts`, plus the `/unsubscribe` page in the React app

**Edit**
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register the 3 new templates
- `src/services/vendorService.ts` — `updateVerificationStatus` and KYC reject helpers invoke `send-transactional-email` with the right template + idempotency key after a successful row update

## Next step

Click below to set up your sender domain. Once that's done, I'll build everything in #2–#5 in one pass.

<lov-actions>
<lov-open-email-setup>Set up email domain</lov-open-email-setup>
</lov-actions>
