
## Reality check

This entire spec is already shipped — every single line. Calling out what exists vs what's missing before proposing anything new:

### Admin panel for vendor approval

| Spec ask | Status | Evidence |
|---|---|---|
| List all vendor applications | ✅ | `AdminVendors.tsx` — filter tabs (all/pending/verified/rejected/suspended/kyc) |
| Show business info / documents / store details | ✅ | `KYCReviewSheet.tsx` opens per vendor with all KYC fields, signed-URL doc previews, store details |
| Approve vendor | ✅ | "Approve" button → `vendorService.updateVerificationStatus(id, 'verified')` |
| Reject vendor with reason | ✅ | KYC reject flow captures `kyc_rejection_reason`. **Vendor-level rejection doesn't capture a reason** — see gaps |
| Only admin access | ✅ | `RoleRoute` + RLS `has_role(auth.uid(), 'admin')` on `vendors` UPDATE |
| Log all actions | ❌ | No audit table. No append-only history of who approved/rejected what, when, why |

### Vendor dashboard post-approval

| Spec ask | Status | Evidence |
|---|---|---|
| Add products | ✅ | `VendorProducts.tsx` + `ProductForm.tsx` |
| Manage inventory | ✅ | Same — stock + low_stock_threshold + reserved_stock |
| View orders | ✅ | `VendorOrders.tsx` with status transitions |
| Track earnings | ✅ | `VendorAnalytics.tsx` + `VendorPayments.tsx` (withdrawable_balance, payouts) |
| Block access until approved | ✅ | `VendorStatusGate` — pending/rejected/suspended screens |
| Notifications on approval/rejection | ✅ in-app | `on_vendor_verified_notify` + `on_vendor_kyc_status_change` triggers |
| Email/SMS on approval/rejection | ❌ | In-app only. No email/SMS provider wired |
| First-time setup / onboarding guide | ❌ | Vendor lands on `VendorOverview` with no checklist or guided "add first product" flow |

**Verdict:** Three real gaps. Everything else duplicates what's live. No new tables/pages for the rest — would just shadow existing ones.

## Plan — close the three real gaps

### 1. Audit log for admin actions on vendors

New table `vendor_audit_log`:
- `id uuid pk`, `vendor_id uuid not null`, `actor_user_id uuid not null` (who did it), `action text not null` (`'verification_approved' | 'verification_rejected' | 'verification_suspended' | 'kyc_approved' | 'kyc_rejected' | 'bank_verified' | 'bank_unverified'`), `previous_status text`, `new_status text`, `reason text`, `metadata jsonb default '{}'`, `created_at timestamptz default now()`
- Append-only RLS: admins can SELECT (read-all) and INSERT only via the vendor row update path. No UPDATE, no DELETE.
- Auto-population via trigger `on_vendor_admin_change()` on `vendors` AFTER UPDATE: if `verification_status`, `kyc_status`, or `bank_verified` changed AND `auth.uid()` is admin, insert a row capturing old/new state, the actor, and any reason field present (`kyc_rejection_reason` for KYC; new `verification_rejection_reason` for top-level — see #2).

Add a vendor-facing read policy too: vendors see their own audit log (so they can see "rejected on Apr 18, reason: …") — gives full transparency.

### 2. Capture reason on top-level vendor rejection/suspension

Schema:
- Add `verification_rejection_reason text` to `vendors` (separate from `kyc_rejection_reason` — different workflows)

UI:
- `KYCReviewSheet`'s "Reject" button (vendor-level) gets the same reason-capture pattern already used for KYC rejection. Required textarea before the destructive update goes through. Same for "Suspend".
- `vendorService.updateVerificationStatus(id, status, reason?)` accepts an optional reason and writes it on rejected/suspended transitions.
- `on_vendor_verified_notify` extended to include the reason in the notification message when present.
- `VendorStatusGate`'s rejected screen displays `verification_rejection_reason` when set (falls back to current generic copy).

### 3. First-time vendor onboarding guide on dashboard

New component `src/components/vendor/VendorGettingStarted.tsx` rendered at the top of `VendorOverview` only when at least one of these is true:
- 0 products in `products` for this vendor
- `vendors.logo` is null OR `vendors.banner` is null
- 0 orders received

Card with a 4-step checklist (each step has done/todo state + CTA button):
1. **Complete your storefront** — set logo + banner → `/vendor/settings`
2. **Add your first product** → `/vendor/products` (opens new product form)
3. **Set shipping pincodes** → `/vendor/settings#serviceability` (uses existing `vendor_serviceability` table; just deep-link to the section)
4. **Receive your first order** — passive, marked done when orders > 0

Dismissible (stored in `localStorage` key `vendor_getting_started_dismissed_{vendor_id}` so it doesn't reappear once explicitly closed). Auto-hides when all 4 are complete.

### 4. Email notification on approval/rejection (out of scope by default — flagged)

The spec asks for email/SMS. Doing this properly requires:
- A configured email domain (currently none) → user has to go through Lovable's email domain setup dialog first
- Then scaffold transactional emails + an `auth-email-hook` for vendor-status-change events

I'm **not** including this in the build because it requires user action (DNS setup) before code can be written. If the user wants emails added, they'll go through the email domain setup flow and I'll wire `send-transactional-email` calls from `on_vendor_verified_notify` + `on_vendor_kyc_status_change` afterwards.

In-app notifications already cover the core "vendor knows status changed" requirement.

## Out of scope (intentional)

- **New admin dashboard / vendor dashboard pages** — `AdminVendors`, `KYCReviewSheet`, `VendorOverview`, `VendorProducts`, `VendorOrders`, `VendorAnalytics`, `VendorPayments`, `VendorSettings`, `VendorStatusGate` already cover every UI requirement. Building parallel screens duplicates without adding value.
- **New backend APIs** — RLS-gated PostgREST + `vendor_apply()` RPC + edge functions already serve as the API layer. Express isn't on the stack.
- **SMS notifications** — needs Twilio/MSG91 secret + per-message cost; documented as a separate workstream
- **Re-apply flow rebuild** — already works: `VendorStatusGate` shows rejection screen + "Reapply" CTA pointing at `/vendor/apply` (the unified wizard).
- **Activating vendor dashboard on approval** — already automatic via `VendorStatusGate` reading `vendorStatus`. No change needed.

## Files

**Migration**
- `supabase/migrations/<ts>_vendor_audit_log.sql` — `vendor_audit_log` table + RLS, `verification_rejection_reason` column on `vendors`, `on_vendor_admin_change` trigger, extended `on_vendor_verified_notify` to surface rejection reason in message

**Edit**
- `src/services/vendorService.ts` — `updateVerificationStatus(id, status, reason?)` signature; new `getVendorAuditLog(vendorId)`
- `src/components/vendor/KYCReviewSheet.tsx` — capture reason for vendor-level reject/suspend (textarea, required); render compact audit-log timeline at the bottom
- `src/components/auth/VendorStatusGate.tsx` — show `verification_rejection_reason` on rejected screen when present
- `src/integrations/supabase/types.ts` — auto-regenerated

**Create**
- `src/components/vendor/VendorGettingStarted.tsx` — first-time onboarding checklist card
- `src/pages/vendor/VendorOverview.tsx` — render `<VendorGettingStarted />` at the top (small edit, but listed under Create since the section is new)
