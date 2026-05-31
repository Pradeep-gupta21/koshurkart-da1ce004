# Vendor Security Regression Test Suite

Add an automated test suite that locks in the column-level vendor security model: only the correct role can read KYC / financial fields, and only through the right RPC.

## Where it lives

Reuse the existing Deno test runner under `supabase/functions/_tests/` (already wired into `supabase--test_edge_functions`). Tests hit the live Supabase REST + RPC endpoints with real role JWTs — this exercises Postgres GRANTs and RLS exactly as production does, which a Vitest/jsdom suite cannot.

```
supabase/functions/
  _test-bootstrap/index.ts        (new) seed + token-mint helper, gated by TEST_BOOTSTRAP_SECRET
  _tests/
    vendor_security_test.ts       (new) the regression suite
```

## Bootstrap helper (`_test-bootstrap`)

A single edge function used only by tests. Guarded by header `x-test-secret` matching new secret `TEST_BOOTSTRAP_SECRET`. Uses service-role client to:

1. Upsert three deterministic test accounts via `auth.admin.createUser` (idempotent, `email_confirm: true`):
   - `sec-buyer@test.koshurkart.local`
   - `sec-vendor@test.koshurkart.local`
   - `sec-admin@test.koshurkart.local`
2. Upsert a `vendors` row owned by the vendor user with known KYC/financial values (`pan_number`, `total_earnings`, `withdrawable_balance`, `kyc_status='approved'`, etc.). Capture its `id` as `TARGET_VENDOR_ID`.
3. Insert `user_roles` row `{user_id: admin, role: 'admin'}` (idempotent).
4. Sign in each user with `signInWithPassword` (fixed password) and return `{ buyerToken, vendorToken, adminToken, vendorId }`.

Config: add `[functions._test-bootstrap]` block in `supabase/config.toml` with `verify_jwt = false`. Add `TEST_BOOTSTRAP_SECRET` via `add_secret`.

## Test cases (`vendor_security_test.ts`)

Setup: one `Deno.test` step calls bootstrap once, stores tokens + `vendorId` in module scope. A `client(token)` helper builds fetch headers (`apikey: ANON`, `Authorization: Bearer <token>`).

### A. Column-level REVOKE on `vendors` table

For each sensitive column group, run a direct REST query `GET /rest/v1/vendors?id=eq.{vendorId}&select=<col>` and assert it fails (HTTP 401/403 or PostgREST permission error) for **anon, buyer, vendor (self), admin** — REVOKE applies to all non-service roles. Columns sampled: `pan_number`, `gstin`, `aadhaar_last4`, `bank_account_number_masked`, `bank_ifsc`, `total_earnings`, `withdrawable_balance`, `phone`, `pickup_address_line1`, `kyc_doc_pan`, `verification_rejection_reason`.

Also assert the **public allow-list** still works for anon: `select=id,store_name,store_slug,logo,trust_score,is_verified,rating` returns 200 with data.

### B. `get_my_vendor()` RPC

- **anon** → 401/empty.
- **buyer** (no vendor row) → `null`/empty result, not an error.
- **vendor** → full row with `pan_number`, `total_earnings`, `kyc_status`, bank fields populated and matching seed values.
- **admin** (no vendor row of own) → null, not other vendors' data.

### C. `get_vendor_admin(_vendor_id)` RPC

- **anon, buyer, vendor (target's own id)** → error or empty (function should require admin role).
- **admin** → returns full sensitive row for the target vendor.

### D. `get_vendor_financials(_vendor_id)` RPC

- **anon, buyer** → denied/empty.
- **vendor** with own id → returns `total_earnings`, `withdrawable_balance`, `total_sales`.
- **vendor** with *another* vendor id → denied/empty.
- **admin** with any vendor id → returns financials.

### E. `list_vendors_admin()` RPC (if present from prior migration)

- **anon, buyer, vendor** → denied/empty.
- **admin** → array contains the seeded vendor with sensitive columns populated.

### F. Negative regression: ensure no fallback path

Direct REST `GET /rest/v1/vendors?select=*` as vendor token must NOT return KYC columns (PostgREST should error on `*` because of the REVOKE, or strip — assert the response either errors or, if 200, does not contain any revoked key). This guards against future migrations that re-grant by accident.

Each assertion uses a clear message so failures point to the exact role × field combination.

## Running

```
supabase--test_edge_functions { functions: ["_tests"], pattern: "vendor_security" }
```

Tests are self-cleaning enough to be idempotent (bootstrap upserts, no DELETEs needed between runs).

## Out of scope

- Profiles email/phone exposure tests (separate follow-up finding).
- Storage bucket upload policy tests.
- Vitest UI-layer mocking — covered indirectly because services call these same RPCs.

## Technical notes

- Deno test file pattern matches existing `*_test.ts` convention picked up by the test runner.
- `auth.admin.createUser` returns 422 if user exists; treat as success and fetch via `listUsers` filter.
- Password constant lives only in the bootstrap function; tests never see it.
- Bootstrap returns short-lived access tokens (default 1h) — fine for a test run.
- If `TEST_BOOTSTRAP_SECRET` is missing in the env, the test suite skips with a clear message rather than failing, so CI without the secret stays green.
