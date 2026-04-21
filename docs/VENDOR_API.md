# Vendor Onboarding API

This project runs on **Lovable Cloud** (Supabase). There is no separate Express
server — the database itself exposes a **typed, JWT-authenticated REST API**
(PostgREST) plus secure RPC functions, all gated by Row-Level Security.

The endpoints requested in the spec (`/api/vendor/register`, `/api/vendor/upload`,
`/api/vendor/status`) already exist as the calls below. This document maps each
requested endpoint to its real implementation and shows both **SDK** and **raw
HTTP** usage for external integrators.

## Auth

Every call requires a Supabase user JWT in the `Authorization` header:

```
Authorization: Bearer <access_token>
apikey: <SUPABASE_PUBLISHABLE_KEY>
```

The browser SDK adds these automatically after `supabase.auth.signInWithPassword`.
For server-to-server calls, exchange credentials once and reuse the access token.

Base URL:

```
https://xlqzbomiuuadxcygnsal.supabase.co
```

---

## 1. `POST /api/vendor/register` — register a new vendor

### Implementation

Two-stage to satisfy storage RLS (the `vendors` row must exist before KYC
documents can be uploaded into the `{user_id}/` folder):

1. **Create the vendor row** via the `vendor_apply` RPC (SECURITY DEFINER —
   atomically inserts into `vendors` and grants the `vendor` role).
2. **Patch onboarding fields** via a normal `UPDATE` on `vendors`. The
   `validate_vendor_kyc_fields` trigger enforces PAN / GSTIN / IFSC / pincode
   / phone formats server-side.

### SDK

```ts
import { supabase } from "@/integrations/supabase/client";

// Step 1 — create vendor row + role
const { data: vendorId, error } = await supabase.rpc("vendor_apply", {
  _store_name: "Acme Co",
  _store_slug: "acme-co",
  _description: "Handcrafted goods",
});
if (error) throw error;

// Step 2 — patch the rest (any subset of columns)
await supabase
  .from("vendors")
  .update({
    business_name: "Acme Pvt Ltd",
    business_type: "pvt-ltd",
    category: "Handicrafts",
    pan_number: "ABCDE1234F",
    gstin: "27ABCDE1234F1Z5",
    aadhaar_last4: "1234",
    bank_account_holder: "Acme Pvt Ltd",
    bank_account_number_masked: "****6789", // mask client-side, never store full PAN
    bank_ifsc: "HDFC0001234",
    phone: "+919876543210",
    pickup_address_line1: "12 MG Road",
    pickup_city: "Srinagar",
    pickup_state: "Jammu & Kashmir",
    pickup_pincode: "190001",
    tagline: "From Kashmir, with care",
    kyc_status: "pending",
    kyc_submitted_at: new Date().toISOString(),
  })
  .eq("id", vendorId);
```

### Raw HTTP

```bash
# Step 1 — RPC
curl -X POST "https://xlqzbomiuuadxcygnsal.supabase.co/rest/v1/rpc/vendor_apply" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"_store_name":"Acme Co","_store_slug":"acme-co","_description":"Handcrafted goods"}'

# Step 2 — PATCH
curl -X PATCH "https://xlqzbomiuuadxcygnsal.supabase.co/rest/v1/vendors?id=eq.$VENDOR_ID" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"business_name":"Acme Pvt Ltd","pan_number":"ABCDE1234F","kyc_status":"pending"}'
```

### Validation

| Field | Rule | Enforced by |
|---|---|---|
| `pan_number` | `^[A-Z]{5}[0-9]{4}[A-Z]$` | DB trigger + Zod |
| `gstin` | optional; `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$` | DB trigger + Zod |
| `aadhaar_last4` | 4 digits (full Aadhaar **never** stored) | DB trigger + Zod |
| `bank_ifsc` | `^[A-Z]{4}0[A-Z0-9]{6}$` | DB trigger + Zod |
| `bank_account_number_masked` | client must mask before storing (`****1234`) | client convention |
| `pickup_pincode` | 6 digits | DB trigger |
| `phone` | E.164 (`^\+?[1-9]\d{9,14}$`) | DB trigger |
| `tagline` | ≤ 80 chars | DB trigger |
| `kyc_status` | one of `not_submitted`, `pending`, `approved`, `rejected` | DB trigger |

---

## 2. `POST /api/vendor/upload` — upload documents and images

Two buckets, both with `{user_id}/` or `{vendor_id}/` path-based RLS:

| Bucket | Visibility | Used for | Path pattern |
|---|---|---|---|
| `vendor-kyc` | **Private** (signed URLs only) | PAN doc, address proof, business proof | `{user_id}/{kind}-{ts}.jpg` |
| `product-images` | Public | Logo, banner | `vendors/{vendor_id}/{kind}-{ts}.jpg` |

Files are compressed client-side to ≤ 5 MB JPEG via `lib/imageCompression`.

### SDK

```ts
import { vendorService } from "@/services/vendorService";

// KYC documents (private)
const panPath = await vendorService.uploadKYCDocument(file, "pan");

// Storefront images (public)
const logoUrl = await vendorService.uploadLogo(vendorId, file);
const bannerUrl = await vendorService.uploadBanner(vendorId, file);
```

### Raw HTTP

```bash
curl -X POST \
  "https://xlqzbomiuuadxcygnsal.supabase.co/storage/v1/object/vendor-kyc/$USER_ID/pan-$(date +%s).jpg" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: image/jpeg" \
  --data-binary @pan.jpg
```

To read a private document, request a signed URL:

```bash
curl -X POST \
  "https://xlqzbomiuuadxcygnsal.supabase.co/storage/v1/object/sign/vendor-kyc/$USER_ID/pan-...jpg" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn":300}'
```

---

## 3. `GET /api/vendor/status` — check approval status

A single `SELECT` against `vendors` filtered by the JWT user. RLS guarantees
the caller can only read their own row.

### SDK

```ts
const { data: { user } } = await supabase.auth.getUser();
const { data, error } = await supabase
  .from("vendors")
  .select("verification_status, kyc_status, bank_verified, kyc_rejection_reason")
  .eq("user_id", user!.id)
  .maybeSingle();
```

### Raw HTTP

```bash
curl "https://xlqzbomiuuadxcygnsal.supabase.co/rest/v1/vendors?user_id=eq.$USER_ID&select=verification_status,kyc_status,bank_verified,kyc_rejection_reason" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $JWT"
```

### Status values

| Field | Values | Meaning |
|---|---|---|
| `verification_status` | `pending`, `approved`, `rejected`, `suspended` | Overall vendor account state |
| `kyc_status` | `not_submitted`, `pending`, `approved`, `rejected` | KYC review state |
| `bank_verified` | `true` / `false` | Admin-confirmed bank details |
| `kyc_rejection_reason` | string \| null | Populated when KYC is rejected |

---

## Security model

- **Authentication**: Supabase Auth issues short-lived JWTs (auto-refreshed by
  the SDK). All write paths require an authenticated session.
- **Authorization**: Row-Level Security on `vendors`, `vendor_onboarding_drafts`,
  and storage objects ensures users can only touch their own data. Admin actions
  go through the `has_role(auth.uid(), 'admin')` predicate.
- **Validation**: A database trigger (`validate_vendor_kyc_fields`) enforces
  all regex-based formats — even direct SQL or raw HTTP cannot bypass it.
- **Sensitive data**:
  - **Aadhaar** — only the last 4 digits are persisted.
  - **Bank account number** — stored masked (`****1234`); the raw value is
    never written.
  - **PAN** — stored in full (regulated identifier required for seller
    onboarding); database is encrypted at rest.
- **KYC documents** live in a private bucket; admins access them via short-lived
  signed URLs (default 5 minutes).

## Region awareness (J&K)

The marketplace surfaces and ranks local Kashmir/Jammu sellers more prominently.

### Locality derivation

A vendor is considered local when their `pickup_state` (set during onboarding
step 3) contains the keywords `kashmir` or `jammu` (case-insensitive). No
separate flag column — the helper `isKashmirVendor(vendor)` in
`src/lib/regionUtils.ts` is the single source of truth.

### Region-aware ranking

`get_ranked_products` and `search_products` accept an optional
`p_user_state text` parameter. When supplied, products whose vendor's
`pickup_state` matches receive a `+0.10` additive boost on `rank_score`.
Backwards compatible — callers that omit the parameter see identical results
to the previous behaviour.

```ts
// Wired automatically via LocationContext.userState
const { data } = await supabase.rpc("get_ranked_products", {
  p_category: "Handicrafts",
  p_limit: 20,
  p_user_state: "Jammu & Kashmir", // optional boost
});
```

### Badges

| Badge | Component | Shown when |
|---|---|---|
| **From Kashmir** | `<FromKashmirBadge />` | `isKashmirVendor(vendor)` |
| **Verified Local Seller** | `<VerifiedLocalSellerBadge />` | Kashmir vendor AND `verification_status='approved'` AND `kyc_status='approved'` |

Rendered on `ProductCard`, `VendorCard`, `ProductDetailPage`, and the vendor's
own `VendorOverview` header.

---

## Why no Express layer?

PostgREST + RLS already provides:

- JWT validation
- Per-row authorization
- Typed responses
- Automatic OpenAPI schema
- Server-side input validation (via triggers)

Adding an Express server in front would duplicate every check while losing the
managed JWT path. For non-CRUD operations (e.g. Razorpay order creation),
**Edge Functions** are used instead — see `supabase/functions/`.
