
## Reality check

Two combined asks: **J&K regionalization** and **production-readiness**. Honest gap analysis against what's already shipped:

### J&K customization

| Spec ask | Status | Evidence |
|---|---|---|
| Vendors select serviceable PIN codes | ✅ | `vendor_serviceability` table + `Vendor manages own serviceability` RLS; `useServiceability` hook + `ServiceabilityBadge` consume `check_serviceability()` RPC |
| Vendor-defined delivery time | ✅ | `vendor_serviceability.delivery_days_override` already overrides `serviceable_pincodes.base_delivery_days` |
| "From Kashmir" badge on products | ⚠️ Partial | `FromKashmirBadge.tsx` component **exists** but is not rendered anywhere. No data signal to drive it. |
| "Verified Local Seller" trust badge | ❌ | No such badge component or vendor flag |
| Boost local sellers in search | ❌ | `search_products` / `get_ranked_products` have no locality term |

### Production-readiness

| Spec ask | Status | Evidence |
|---|---|---|
| Input validation (client + server) | ✅ | Zod across forms + `validate_vendor_kyc_fields` trigger |
| Secure file uploads | ✅ | Private `vendor-kyc` bucket with `{user_id}/` RLS; public `product-images` w/ same prefix; 5 MB cap + MIME via `imageCompression` |
| Bank details "encryption" | ✅ via masking | `bank_account_number_masked` only — full PAN required by industry norm. Application-level KMS encryption is a separate workstream (not requested before, not building speculatively) |
| Caching | ✅ | `cacheService` with TTLs; `useServiceability` already uses it |
| API performance / scalability | ✅ structurally | PostgREST + RPCs + GIN search index + row-level pagination already scale to thousands |
| Upload retry logic | ❌ | `uploadKYCDocument` / `uploadLogo` / `uploadBanner` fail-fast on transient network errors |
| Environment variables / secret hygiene | ✅ | `.env` auto-managed; secrets in Supabase secrets vault; no hardcoded keys |
| API tests | ⚠️ Partial | Edge function Deno tests exist (`location_test.ts`, `menu_test.ts`); no tests for `vendor_apply` / serviceability RPC |
| Form validation tests | ⚠️ Partial | `ExpandableMenu`, `SidebarItem`, `CartContext`, `LocationContext` tested; vendor onboarding schemas untested |

**Verdict:** 5 real gaps. Everything else duplicates what's live. No new auth/upload/validation infra — would shadow existing.

## Plan

### 1. Surface "From Kashmir" + "Verified Local Seller" badges (data + UI)

Add a derived locality flag — no new column, computed from existing `pickup_state`:
- Helper `isKashmirVendor(vendor)` → `vendor.pickup_state?.toLowerCase().includes('kashmir') || vendor.pickup_state?.toLowerCase().includes('jammu')`
- New badge `VerifiedLocalSellerBadge.tsx` (shield + "Verified Local Seller", green) shown only when vendor is Kashmir AND `verification_status='approved'` AND `kyc_status='approved'`
- Render `<FromKashmirBadge />` on `ProductCard` (top-left over image) and `VendorCard` (header) when `isKashmirVendor(vendor)` is true
- Render `<VerifiedLocalSellerBadge />` on `VendorCard` and product detail page (`ProductDetailPage`) under the price block, plus on `VendorOverview` self-view as a positive signal

Vendor data shape: `ProductCard` already receives `store_name` from joined vendor; extend the product-vendor join in `productService` (and `get_ranked_products` / `get_local_deals` RPCs) to also return `pickup_state`. Cheap (single column, already indexed by vendor join).

### 2. Boost local sellers in ranking (region-aware sort)

Extend `get_ranked_products` and `search_products` RPCs to accept an optional `p_user_state text` parameter. When set, add a 0.10 weight bump to `rank_score` for products whose vendor's `pickup_state` matches `p_user_state` (case-insensitive). Final formula stays additive — no breaking change for callers that don't pass it.

Wire-up: `useLocation` already exposes the user's pincode; resolve state from `serviceable_pincodes` (existing table has `state`) once on context init and cache. `searchService` and homepage rails pass `p_user_state` through.

Out of scope: a hard "Kashmir-only" filter toggle. Spec says **boost**, not exclude. If user wants the toggle later, it's a 1-line `WHERE` extension.

### 3. KYC bucket signed-URL refresh + retry on transient upload failures

Wrap upload helpers in `vendorService` with exponential-backoff retry (3 attempts: 0ms / 500ms / 1500ms) for transient errors (network errors, 5xx). Skip retries for 4xx/auth/quota errors — those are user-actionable.

Pattern: small `withRetry(fn, { retries, isTransient })` util in `src/lib/retry.ts`. Apply to `uploadKYCDocument`, `uploadLogo`, `uploadBanner`. Log attempts via existing `logger`. Toast only on final failure.

### 4. Test coverage for the two real gaps

- **Schema test**: `src/lib/validators/__tests__/vendorOnboardingSchema.test.ts` — happy path + boundary cases (PAN regex, IFSC, pincode, slug, phone, tagline length) for all 5 step schemas. Fast Vitest; no DB.
- **Edge-equivalent RPC test**: `supabase/functions/_tests/vendor_serviceability_test.ts` — Deno test that exercises `check_serviceability()` against a seeded test pincode + vendor, asserting deliverable + ETA + COD propagation. Mirrors existing `location_test.ts` pattern.

Skipping E2E (Playwright) for vendor onboarding — the wizard is already partly covered by `vendor_apply()` rpc tests via `useVendor` flow; full E2E is a separate workstream.

### 5. Documentation update

Append a "Region awareness" section to `docs/VENDOR_API.md` documenting the new `p_user_state` param, the locality derivation rule (`pickup_state` includes "kashmir"/"jammu"), and badge display rules. Keeps the API contract honest.

## Out of scope (intentional)

- **Application-level encryption of PAN/bank fields** — Postgres at-rest encryption + masking is the current posture; KMS column encryption needs a separate decision (key rotation, query patterns). Not requested explicitly.
- **New "is_local_kashmir" boolean column** — derivable from `pickup_state` with zero migration risk; adding a column invites drift.
- **Hard Kashmir-only marketplace mode** — spec says boost, not gate. Will not add.
- **SMS/email notification for vendor status** — already flagged separately; pending email-domain setup.
- **Rate limiting on uploads** — `rateLimiter` already exists for login/clicks; storage uploads are gated by Supabase per-project limits.

## Files

**Migration**
- `supabase/migrations/<ts>_region_aware_ranking.sql` — extend `get_ranked_products(p_user_state text default null)` and `search_products(p_user_state text default null)` with locality boost; extend `get_local_deals` and `get_trending_products` returned columns to include `pickup_state` (joined from vendors)

**Create**
- `src/components/product/VerifiedLocalSellerBadge.tsx` — shield + "Verified Local Seller" pill
- `src/lib/regionUtils.ts` — `isKashmirVendor(v)` helper + `KASHMIR_STATE_KEYWORDS`
- `src/lib/retry.ts` — generic `withRetry` util (transient-error classifier)
- `src/lib/validators/__tests__/vendorOnboardingSchema.test.ts`
- `supabase/functions/_tests/vendor_serviceability_test.ts`

**Edit**
- `src/components/product/ProductCard.tsx` — render `<FromKashmirBadge />` when vendor is local
- `src/components/vendor/VendorCard.tsx` — render From-Kashmir + Verified-Local-Seller badges
- `src/pages/ProductDetailPage.tsx` — render Verified-Local-Seller badge under price
- `src/pages/vendor/VendorOverview.tsx` — show Verified-Local-Seller badge in header when applicable
- `src/services/productService.ts` — pass `p_user_state` to ranking RPCs; include `pickup_state` in joins/selects
- `src/services/searchService.ts` — pass `p_user_state` from `useLocation` state
- `src/contexts/LocationContext.tsx` — resolve + expose `userState` from pincode lookup
- `src/services/vendorService.ts` — wrap `uploadKYCDocument`, `uploadLogo`, `uploadBanner` with `withRetry`
- `docs/VENDOR_API.md` — region-awareness section
- `src/integrations/supabase/types.ts` — auto-regenerated
