/**
 * KoshurKart — Business rules knowledge
 * =================================================================
 * Structured, provider-agnostic marketplace rules for grounding AI
 * conversations (order support, policy questions, dispute handling).
 *
 * SOURCE OF TRUTH: every value below is extracted *only* from content
 * that already exists in this repository. Primary sources:
 *   - src/pages/RefundReturnPolicyPage.tsx  (returns, refunds, cancellation, replacement, fraud)
 *   - src/pages/TermsAndConditionsPage.tsx  (orders/payments, vendor & user obligations, prohibited acts)
 *   - src/contexts/CartContext.tsx          (shipping, serviceability, COD availability)
 *   - src/types/order.ts                    (order/payment/shipping statuses, payment methods)
 *   - supabase/functions/create-checkout/index.ts (payment flow, order creation, stock reservation)
 *   - src/config/platformSettings.ts        (commission model)
 *   - src/pages/vendor/VendorReturns.tsx    (return request statuses)
 *   - docs/VENDOR_API.md, src/lib/regionUtils.ts (region awareness, authenticity/verification)
 *
 * No external or invented facts are included. Policy timelines and text
 * mirror the published policy pages verbatim in substance.
 */

export const BUSINESS_RULES = {
  /** Support contact published on the policy pages. */
  supportEmail: "support@koshurkart.com",

  /**
   * Shipping policies.
   * Source: src/contexts/CartContext.tsx (serviceability-driven shipping),
   * src/pages/CheckoutPage.tsx (free when shippingTotal is 0).
   */
  shipping: {
    // Shipping is derived per serviceable pincode from a surcharge percentage.
    calculation:
      "Per item: shipping = itemPrice * quantity * (surcharge_pct / 100), summed across the cart.",
    freeShippingWhen: "shippingTotal is 0 (no surcharge for the destination) — shown as 'Free'.",
    // Server re-quotes the price; the client never sets shipping/pricing itself.
    serverAuthoritative:
      "Final amount (subtotal + shipping) is server-quoted via quote-checkout; the client cannot set prices.",
  },

  /**
   * Delivery rules.
   * Source: src/contexts/CartContext.tsx serviceability, docs/VENDOR_API.md region rules.
   */
  delivery: {
    // Serviceability is checked per product against the destination pincode.
    serviceabilityFields: ["deliverable", "cod", "surcharge_pct"],
    // An order cannot be placed if any item is not deliverable to the destination.
    blocksCheckoutIfUnserviceable: true,
    pincodeFormat: "6 digits",
    // Region-aware ranking favours local Kashmir/Jammu sellers.
    regionAwareness:
      "Products from vendors whose pickup_state matches the shopper's state receive a +0.10 ranking boost.",
  },

  /**
   * Cash on Delivery (COD) policies.
   * Source: src/contexts/CartContext.tsx, src/pages/CheckoutPage.tsx, Terms §3.
   */
  cod: {
    // COD is available by default but can be turned off per product and per destination.
    availableByDefault: true,
    disabledWhen: [
      "A product has allowCod === false.",
      "The destination pincode's serviceability marks COD as unavailable (row.cod is false).",
    ],
    // Payment must be completed in full before processing, except where COD is offered.
    paymentTiming: "Full payment before processing is required, except where COD is explicitly offered.",
    // COD refunds go to a customer-provided UPI ID or bank account.
    refundDestination: "UPI ID or bank account provided by the customer.",
  },

  /**
   * Return policies.
   * Source: src/pages/RefundReturnPolicyPage.tsx.
   */
  returns: {
    // Default return window unless the vendor states otherwise on the product page.
    windowDays: 7,
    windowNote: "Within 7 days of delivery, unless a different window is stated by the vendor on the product page.",
    eligibleReasons: [
      "Delivered damaged",
      "Delivered defective or not functioning as described",
      "The wrong item received",
      "Missing items from a multi-product order",
    ],
    nonReturnableItems: [
      "Perishable goods (food, saffron, fresh produce)",
      "Personalized or customized products",
      "Digital products and downloadable content",
      "Items clearly marked as 'non-returnable' on the listing",
      "Innerwear, intimate items, and consumables once opened",
    ],
    requestProcess: [
      "Open the order from the Orders section of your profile.",
      "Click 'Request Return' on the relevant item.",
      "Select a reason from the provided list.",
      "Upload supporting images or a short video if required (recommended for damaged/wrong-item claims).",
      "Submit the request and await confirmation.",
    ],
    approval:
      "Each request is reviewed by the vendor and, where necessary, the Koshur Kart team; additional evidence may be requested.",
    // Return lifecycle statuses (VendorReturns.tsx). 'none' is the default (no active return).
    statuses: ["none", "requested", "approved", "rejected", "refunded"],
  },

  /**
   * Refund policies.
   * Source: src/pages/RefundReturnPolicyPage.tsx.
   */
  refunds: {
    initiation:
      "Once a return is approved and the product is received and verified by the vendor, the refund is initiated automatically.",
    destination:
      "Issued to the original payment method when possible; for COD, credited to a customer-provided UPI ID or bank account.",
    // Estimated processing times after refund initiation.
    timelines: {
      upi: "3–7 business days",
      cards: "5–10 business days",
      netBankingWallets: "3–7 business days",
      cashOnDelivery: "5–7 business days to UPI / bank",
    },
    timelinesAreEstimates: true,
    // Replacement may be offered instead of a refund.
    replacement:
      "Eligible products may be replaced instead of refunded — subject to vendor policy, availability, and serviceability.",
  },

  /**
   * Cancellation rules.
   * Source: src/pages/RefundReturnPolicyPage.tsx §9.
   */
  cancellation: {
    beforeShipment: "Orders may be cancelled any time before they are shipped, free of charge.",
    afterShipment: [
      "Cancellation may no longer be available once shipped.",
      "The standard return process applies once the package is delivered.",
    ],
  },

  /**
   * Payment flow.
   * Source: supabase/functions/create-checkout/index.ts, src/types/order.ts, CheckoutPage.tsx.
   */
  paymentFlow: {
    // create-checkout is the single backend source of truth.
    serverSourceOfTruth:
      "The client sends only product_ids + quantities; the server re-prices from the DB, reserves stock, and creates the order/items/payment (and gateway artifact for razorpay/upi) in INR.",
    idempotency:
      "Clients send a stable idempotency_key per attempt; retries with the same key return the same order/payment instead of duplicating.",
    supportedMethods: ["razorpay", "upi", "cod"],
    // Payment method values recorded on the payment record (order.ts Payment).
    recordedPaymentMethods: ["upi", "card", "netbanking", "wallet", "cod", "razorpay"],
    // Payment record statuses (order.ts Payment.paymentStatus).
    paymentStatuses: ["pending", "success", "failed", "refunded", "pending_verification"],
    methodSettlement: {
      razorpay: "Redirect to Razorpay checkout; the signature is verified server-side (verify-razorpay-payment).",
      upi: "Pay via QR/UPI ID, optionally upload proof; confirmed then admin-verified (status pending_verification).",
      cod: "Order confirmed immediately; payment collected on delivery.",
    },
    // On order creation vs. successful payment.
    onCreate: "payment_status='pending', order_status='processing'.",
    onPaymentSuccess: "order_status is set to 'confirmed'.",
  },

  /**
   * Commissions.
   * Source: src/config/platformSettings.ts, src/types/order.ts Payment.
   */
  commissions: {
    defaultEnabled: false,
    defaultPercentage: 0,
    configuredVia: "platform_settings table (key='commission').",
    formula:
      "commission = amount * (percentage / 100); vendorEarnings = amount - commission. If disabled or percentage<=0, commission=0 and the vendor keeps the full amount.",
    // Each payment record stores the commission snapshot.
    recordedOnPayment: ["platformCommission", "commissionPercentage", "vendorEarnings"],
  },

  /**
   * Vendor obligations.
   * Source: TermsAndConditionsPage.tsx §4, RefundReturnPolicyPage.tsx §11.
   */
  vendorObligations: [
    "Provide accurate product information — descriptions, images, pricing, and stock availability.",
    "Ensure the quality, packaging, and timely fulfillment of every accepted order.",
    "Honor approved returns, replacements, and refunds per marketplace policy.",
    "Avoid fraudulent, misleading, or abusive activity — violations can lead to suspension or removal.",
  ],

  /**
   * Customer obligations.
   * Source: TermsAndConditionsPage.tsx §2–§3, RefundReturnPolicyPage.tsx intro.
   */
  customerObligations: [
    "Maintain the confidentiality of account credentials and remain responsible for all account activity.",
    "Provide accurate, current, and complete registration information and keep it up to date.",
    "Report any unauthorized access or suspected security breach to support.",
    "Complete payment in full before processing, except where Cash on Delivery is offered.",
    "By placing an order, agree to the returns, refunds, and cancellation terms.",
  ],

  /**
   * Order lifecycle.
   * Source: src/types/order.ts and create-checkout stock handling.
   */
  orderLifecycle: {
    orderStatuses: ["processing", "confirmed", "shipped", "delivered", "cancelled", "returned"],
    shippingStatuses: ["pending", "shipped", "in_transit", "out_for_delivery", "delivered"],
    orderPaymentStatuses: ["pending", "completed", "failed"],
    // Stock is reserved at checkout and released if the order is abandoned.
    stockHandling: {
      reservedAtCheckout: "reserve_stock is called when the order is created.",
      staleRelease: "sweep_stale_orders releases stock from abandoned/unpaid orders.",
    },
    // Fulfillment fields tracked on an order.
    fulfillmentFields: ["shippingProvider", "trackingId", "estimatedDelivery"],
  },

  /**
   * Authenticity requirements.
   * Source: TermsAndConditionsPage.tsx §7, docs/VENDOR_API.md, regionUtils.ts,
   * plus the review verification model.
   */
  authenticity: {
    // Sellers are verified via KYC before selling; badges signal provenance.
    vendorVerification: "Sellers complete KYC and admin verification before their store is approved.",
    badges: [
      { badge: "From Kashmir", shownWhen: "Vendor pickup_state is in Kashmir/Jammu." },
      {
        badge: "Verified Local Seller",
        shownWhen: "Kashmir vendor with verification_status='approved' and kyc_status='approved'.",
      },
    ],
    // Review integrity.
    reviewIntegrity: [
      "Reviews can be flagged as verified purchases.",
      "Fake reviews, rating manipulation, and coordinated inauthentic behavior are prohibited.",
      "Suspicious reviews are flagged and moderated.",
    ],
    provenance:
      "Products are sourced through direct artisan partnerships, ensuring fair earnings and authentic provenance.",
  },

  /**
   * Platform policies (marketplace-wide rules & rights).
   * Source: TermsAndConditionsPage.tsx §3/§5/§7/§10, RefundReturnPolicyPage.tsx §10.
   */
  platformPolicies: {
    orderConfirmation:
      "All orders are subject to product availability and vendor confirmation; availability is not guaranteed until the order is confirmed and payment captured.",
    pricingChanges: "Prices, promotions, and discounts may change at any time without prior notice.",
    fraudPrevention:
      "Koshur Kart may reject fraudulent, abusive, or policy-violating refund/return claims; repeated misuse can lead to account suspension.",
    rightToCancel:
      "Koshur Kart reserves the right to cancel, hold, or refund any order suspected of fraud, abuse, or policy violation.",
    accountSuspension:
      "Accounts that violate the Terms, policies, or applicable laws may be suspended, restricted, or terminated with or without notice.",
    prohibitedActivities: [
      "Fraudulent transactions, chargeback abuse, or money laundering.",
      "Posting fake reviews, manipulating ratings, or coordinating inauthentic behavior.",
      "Unauthorized access attempts, scraping, reverse engineering, or interfering with platform security.",
      "Any other misuse that harms users, vendors, or marketplace integrity.",
    ],
  },
} as const;

/** Convenience type for consumers that need to reference the business-rules shape. */
export type BusinessRules = typeof BUSINESS_RULES;
