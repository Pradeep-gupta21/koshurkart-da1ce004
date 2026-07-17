/**
 * KoshurKart — Vendor knowledge
 * =================================================================
 * Structured, provider-agnostic facts about how vendors (sellers)
 * onboard, get verified, are paid, and operate on KoshurKart.
 * Intended to ground AI conversations for vendor support.
 *
 * SOURCE OF TRUTH: every value below is extracted *only* from content
 * that already exists in this repository. Primary sources:
 *   - src/pages/VendorOnboardingPage.tsx            (onboarding step list)
 *   - src/lib/validators/vendorOnboardingSchema.ts  (per-step fields, store categories)
 *   - src/lib/validators/kycSchema.ts               (KYC business/bank rules, business types)
 *   - src/config/platformSettings.ts                (commission model)
 *   - src/services/vendorService.ts                 (verification/KYC flow, trust metrics)
 *   - src/services/paymentService.ts                (payout request/summary)
 *   - src/config/navigation.ts                      (vendor dashboard menu)
 *   - docs/VENDOR_API.md                            (register/upload/status, security model, region rules)
 *   - src/lib/regionUtils.ts                        (J&K locality derivation)
 *
 * No external or invented facts are included.
 */

export const VENDOR_KNOWLEDGE = {
  /**
   * Vendor onboarding — a 6-step wizard.
   * Step labels: src/pages/VendorOnboardingPage.tsx.
   * Per-step fields: src/lib/validators/vendorOnboardingSchema.ts.
   */
  onboarding: {
    entryPoints: ["/vendor/apply", "/vendor/apply/kyc"],
    steps: [
      {
        id: 1,
        label: "Basic Info",
        fields: ["full_name", "email", "phone", "phone_verified"],
        notes: "Phone is E.164 format and can be verified via OTP.",
      },
      {
        id: 2,
        label: "Business",
        fields: ["store_name", "store_slug", "business_type", "category", "description"],
        notes: "Store name 3–80 chars; slug is lowercase letters, numbers, and hyphens.",
      },
      {
        id: 3,
        label: "Address",
        fields: [
          "pickup_address_line1",
          "pickup_address_line2",
          "pickup_pincode",
          "pickup_city",
          "pickup_state",
          "pickup_country",
        ],
        notes: "Pincode is 6 digits; country defaults to IN. pickup_state drives J&K locality.",
      },
      {
        id: 4,
        label: "KYC",
        fields: [
          "business_name",
          "pan_number",
          "gstin",
          "aadhaar_last4",
          "bank_account_holder",
          "bank_account_number",
          "bank_ifsc",
          "doc_pan_path",
          "doc_address_path",
          "doc_business_path",
        ],
        notes: "GSTIN and business document are optional; PAN + address documents are required.",
      },
      {
        id: 5,
        label: "Storefront",
        fields: ["logo_url", "banner_url", "tagline"],
        notes: "Tagline max 80 characters.",
      },
      {
        id: 6,
        label: "Review",
        fields: [],
        notes: "Final review before submission.",
      },
    ],
    // Drafts autosave as the vendor progresses (vendor_onboarding_drafts table).
    draftAutosave: true,
    // Store categories offered during onboarding (vendorOnboardingSchema.ts STORE_CATEGORIES).
    storeCategories: [
      "Electronics",
      "Handicrafts",
      "Apparel",
      "Beauty",
      "Home & Kitchen",
      "Grocery",
      "Books",
      "Sports",
      "Other",
    ],
    // Legal business types (kycSchema.ts BUSINESS_TYPES).
    businessTypes: ["individual", "proprietorship", "partnership", "pvt-ltd", "llp"],
  },

  /**
   * Verification process.
   * Sources: docs/VENDOR_API.md, src/services/vendorService.ts.
   */
  verification: {
    // Two-stage registration to satisfy storage RLS (row must exist before KYC upload).
    registration: [
      "Create the vendor row and grant the 'vendor' role via the vendor_apply RPC (SECURITY DEFINER).",
      "Patch onboarding + KYC fields via UPDATE on vendors; the validate_vendor_kyc_fields trigger enforces formats server-side.",
    ],
    // Overall vendor account state (vendors.verification_status).
    verificationStatuses: ["pending", "approved", "verified", "rejected", "suspended"],
    // KYC review state (vendors.kyc_status).
    kycStatuses: ["not_submitted", "pending", "approved", "rejected"],
    // Admin-confirmed bank details flag.
    bankVerifiedFlag: "bank_verified",
    // On KYC approval the platform syncs is_verified=true and verification_status='verified'.
    onKycApproval:
      "Sets kyc_status='approved', is_verified=true, verification_status='verified', clears rejection reasons.",
    // On rejection a reason is stored (kyc_rejection_reason / verification_rejection_reason).
    rejectionRequiresReason: true,
    // Admins read private KYC documents via short-lived signed URLs (default 5 minutes).
    kycDocumentAccess: "Private 'vendor-kyc' bucket; admins use signed URLs (default 5 min expiry).",
    // A rejected vendor can update KYC and reapply; suspended vendors must contact support.
    reapplyOnRejection: true,
  },

  /**
   * Commission model.
   * Source: src/config/platformSettings.ts.
   */
  commissions: {
    // Platform default: commission is disabled and the percentage is 0.
    defaultEnabled: false,
    defaultPercentage: 0,
    // Live values are read from the platform_settings table (key='commission').
    configuredVia: "platform_settings table (key='commission')",
    // calculateCommission(): when disabled or percentage <= 0, the vendor keeps the full amount.
    calculation:
      "commission = amount * (percentage / 100); vendorEarnings = amount - commission. If disabled or percentage<=0, commission=0 and vendorEarnings=amount.",
    // Commission-exempt vendors with a configured personal UPI can take direct UPI payments at checkout.
    commissionExemptDirectUpi:
      "Commission-exempt vendors with a personal UPI/QR can receive payments directly from buyers at checkout.",
  },

  /**
   * Seller workflow — the lifecycle from applying to selling.
   * Synthesized from onboarding, VendorStatusGate, and vendor dashboard routes.
   */
  sellerWorkflow: [
    "Apply to become a vendor (creates the vendor row + 'vendor' role).",
    "Complete the 6-step onboarding wizard, including KYC submission.",
    "Wait for admin review — the dashboard is gated while status is 'pending'.",
    "Once approved/verified, access the full vendor dashboard.",
    "List and manage products, fulfil orders, handle returns, run ad campaigns.",
    "Track earnings and request payouts from the available balance.",
  ],
  // The vendor dashboard is gated by VendorStatusGate based on verification_status.
  dashboardGating: {
    noVendorRow: "Prompted to apply ('Become a Vendor').",
    pending: "Shown 'Application Under Review' with a KYC-completion checklist.",
    rejected: "Prompted to update KYC and reapply.",
    suspended: "Shown a suspension screen with a support contact.",
    approvedOrVerified: "Full dashboard access.",
  },

  /**
   * Dashboard capabilities — the vendor dashboard sections.
   * Source: src/config/navigation.ts (vendorNav) and vendor pages.
   */
  dashboard: {
    basePath: "/vendor",
    sections: [
      { path: "/vendor", label: "Overview", capability: "KPIs: sales, earnings, withdrawable balance, product count, low-stock alerts, trust score." },
      { path: "/vendor/products", label: "Products", capability: "Create/edit products: images, category, stock, COD toggle, status (active/draft/archived)." },
      { path: "/vendor/orders", label: "Orders", capability: "View incoming order items; update shipping status and tracking details." },
      { path: "/vendor/returns", label: "Returns", capability: "Review buyer return requests; approve, reject, or refund." },
      { path: "/vendor/campaigns", label: "Ad Campaigns", capability: "Create and manage sponsored-product campaigns (placement, budget, bid)." },
      { path: "/vendor/analytics", label: "Analytics", capability: "Sales, views, clicks, conversion, and product-mix charts over time ranges." },
      { path: "/vendor/payments", label: "Payments", capability: "Earnings, withdrawable balance, ad spend, payout history; request payouts." },
      { path: "/vendor/notifications", label: "Notifications", capability: "Realtime in-app notifications with mark-as-read." },
      { path: "/vendor/settings", label: "Store Settings", capability: "Store profile (name, description, logo/banner), KYC status, shipping serviceability." },
    ],
    // Trust metrics tracked per vendor (vendorService.getTrustMetrics).
    trustMetrics: ["trust_score", "delivery_rate", "cancellation_rate", "return_rate", "review_rating", "is_verified"],
  },

  /**
   * Payouts.
   * Sources: src/services/paymentService.ts (requestPayout, getPayoutSummary),
   * src/services/vendorService.ts (getFinancials).
   */
  payouts: {
    // Vendors request a payout for an amount against their withdrawable balance.
    requestFlow: "requestPayout(vendorId, amount) inserts a row into the payouts table.",
    // Financial summary fields (get_vendor_financials RPC).
    financials: ["total_earnings", "withdrawable_balance", "total_sales"],
    // Payout summary buckets (getPayoutSummary).
    summary: {
      withdrawableBalance: "Amount currently available to withdraw.",
      totalPaidOut: "Sum of payouts with status 'completed'.",
      pendingPayouts: "Sum of payouts with status 'pending'.",
    },
    // Payout record statuses referenced in the summary logic.
    statuses: ["pending", "completed"],
    // Ledger + triggers that govern vendor earnings (from the migrations layer).
    earningsLedger: "vendor_wallet_ledger (double-entry).",
    relatedTriggers: [
      "on_cod_delivered_credit — credits earnings when COD orders are delivered.",
      "validate_payout_request — validates a payout request.",
      "debit_balance_on_payout_complete — debits balance when a payout completes.",
      "on_order_refund_reverse_earnings — reverses earnings on refunds.",
    ],
  },

  /**
   * Vendor policies & data-handling rules.
   * Sources: docs/VENDOR_API.md (security model, region awareness),
   * src/lib/validators/kycSchema.ts, src/lib/regionUtils.ts.
   */
  policies: {
    // Field-format rules enforced by both Zod and the DB trigger.
    validation: {
      pan: "^[A-Z]{5}[0-9]{4}[A-Z]$ (required; stored in full — regulated identifier).",
      gstin: "Optional; ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$.",
      ifsc: "^[A-Z]{4}0[A-Z0-9]{6}$.",
      aadhaar: "Only the last 4 digits are ever stored.",
      bankAccountNumber: "Stored masked (****1234); the raw value is never written.",
      pincode: "6 digits.",
      phone: "E.164 (^\\+?[1-9]\\d{9,14}$).",
      tagline: "≤ 80 characters.",
    },
    // Document upload rules.
    documents: {
      maxSizeBytes: 5 * 1024 * 1024, // 5 MB
      compressedToJpeg: true,
      kycBucket: "vendor-kyc (private, signed URLs only)",
      storefrontBucket: "product-images (public, for logo/banner)",
      requiredDocs: ["PAN document", "Address proof"],
      optionalDocs: ["Business document"],
    },
    // Security & authorization model.
    security: [
      "Supabase Auth issues short-lived JWTs; all write paths require an authenticated session.",
      "Row-Level Security ensures vendors can only access their own data.",
      "Admin actions are gated by has_role(auth.uid(), 'admin').",
      "The validate_vendor_kyc_fields DB trigger enforces formats even for raw SQL/HTTP.",
    ],
    // Checkout display-name preference chosen during KYC.
    checkoutDisplayName: {
      options: ["store", "bank"],
      meaning: "Whether the store name or the bank account holder name is shown to customers at checkout.",
    },
    // Region awareness for Kashmir / Jammu sellers.
    regionAwareness: {
      localityKeywords: ["kashmir", "jammu"],
      derivation: "A vendor is 'local' when pickup_state contains 'kashmir' or 'jammu' (isKashmirVendor).",
      rankingBoost: "+0.10 additive boost on rank_score when a shopper's state matches the vendor's pickup_state.",
      badges: [
        { badge: "From Kashmir", shownWhen: "isKashmirVendor(vendor)" },
        {
          badge: "Verified Local Seller",
          shownWhen: "Kashmir vendor AND verification_status='approved' AND kyc_status='approved'",
        },
      ],
    },
  },
} as const;

/** Convenience type for consumers that need to reference the vendor shape. */
export type VendorKnowledge = typeof VENDOR_KNOWLEDGE;
