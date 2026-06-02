# Production Cleanup Plan

Wipe every test/demo row and every uploaded file, while preserving database structure, RLS policies, functions, triggers, edge functions, auth config, payment settings, menu items, pincodes, and platform settings.

## What gets deleted

**Auth & profile data (all 11 accounts):**
- 11 `auth.users` (cascades to `profiles`, `user_roles`, `user_locations`, `user_sessions`, `vendor_onboarding_drafts`, `auth_events`)
- Includes `admin@test.com`, `vendor@test.com`, `user@test.com`, `admin1@test.com`, sec-test accounts, phone OTP test, and 3 gmail testers

**Vendor & commerce data:**
- 3 vendors (`vendor`, `kiara general sore`, `Sec Test Store`)
- 3 products (`car`, `mic`, `piano`)
- 22 orders + 22 order_items + 22 payments + all payment_logs / payment_audit_log
- 0 reviews, 0 ad_campaigns (already empty)
- 55 notifications, all analytics_events, auth_rate_limits, phone_otps, vendor_audit_log, shipment_events, webhook_events, suspicious_clicks, suppressed_emails, email_send_log, email_unsubscribe_tokens, vendor_serviceability

**Storage objects:**
- All 7 files in `product-images`
- All 3 files in `vendor-kyc`
- (review-images and payment-proofs already empty)

## What is preserved

- All tables, columns, RLS policies, GRANTs, functions, triggers, indexes
- `menu_items` (23 rows — navigation)
- `serviceable_pincodes` (60 rows)
- `platform_settings` (2 rows — commission/payment config)
- `pricing_rules`, `ad_placements`
- Edge functions, auth providers, SMTP/custom email domain (`notify.notify.koshurkart.shop`), Razorpay/UPI secrets
- All application code (UI, vendor onboarding, product upload, checkout, etc.)

## Execution

**Step 1 — Migration: truncate data tables in dependency-safe order.** Single migration using `TRUNCATE ... RESTART IDENTITY CASCADE` on transactional tables; targeted `DELETE` on `auth.users` (cascades through FKs to profiles/roles/locations/sessions/drafts/auth_events).

**Step 2 — Storage cleanup:** `DELETE FROM storage.objects WHERE bucket_id IN ('product-images','vendor-kyc','review-images','payment-proofs');`

**Step 3 — Verification queries:** Re-count every wiped table; confirm preserved tables (menu_items=23, pincodes=60, platform_settings=2) are intact.

**Step 4 — Smoke test of vendor flow:** Read code paths only (no DB writes) to confirm `vendor_apply` RPC, product insert RLS, and storage upload policies are unchanged — these depend on schema/policies which the cleanup does not touch.

**Step 5 — Report** with exact counts deleted per table and per bucket.

## After cleanup

Sign up at `/auth` with your real email → that user gets auto-created in `profiles` + `user_roles(user)` by the `handle_new_user` trigger. To promote yourself to admin, I'll provide a one-line SQL snippet you can paste (or run via an insert call) after you tell me your new user_id.

## Technical details

```sql
-- Migration (Step 1)
TRUNCATE TABLE
  public.payment_logs, public.payment_audit_log, public.payments,
  public.shipment_events, public.order_items, public.orders,
  public.review_helpful_votes, public.reviews,
  public.notifications, public.analytics_events, public.suspicious_clicks,
  public.ad_campaigns,
  public.vendor_audit_log, public.vendor_serviceability,
  public.vendor_onboarding_drafts,
  public.products,
  public.vendors,
  public.user_sessions, public.user_locations,
  public.auth_events, public.auth_rate_limits, public.phone_otps,
  public.webhook_events,
  public.email_send_log, public.email_unsubscribe_tokens, public.suppressed_emails
RESTART IDENTITY CASCADE;

DELETE FROM auth.users;  -- cascades to profiles, user_roles via FK
```

```sql
-- Storage (Step 2)
DELETE FROM storage.objects
WHERE bucket_id IN ('product-images','vendor-kyc','review-images','payment-proofs');
```

No schema changes. No policy changes. No code changes.
