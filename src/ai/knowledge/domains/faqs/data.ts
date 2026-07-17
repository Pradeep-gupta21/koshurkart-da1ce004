/**
 * KoshurKart — FAQ knowledge
 * =================================================================
 * Provider-agnostic set of common customer questions and answers for
 * grounding AI support conversations.
 *
 * SOURCE OF TRUTH: every Q&A below is derived *only* from content that
 * already exists in this repository. Primary sources:
 *   - src/pages/SupportPage.tsx              (the existing on-site FAQ — reproduced verbatim)
 *   - src/lib/supportConfig.ts               (support email / WhatsApp channels)
 *   - src/pages/RefundReturnPolicyPage.tsx   (returns, refunds, cancellation)
 *   - src/pages/TermsAndConditionsPage.tsx   (orders, payments, accounts, security)
 *   - src/pages/CheckoutPage.tsx + CartContext.tsx (payment methods, COD, shipping)
 *   - src/pages/AboutUsPage.tsx              (secure payments, why choose)
 *   - docs/VENDOR_API.md + vendor onboarding (vendor verification, authenticity)
 *   - src/config/categories.ts + regionUtils.ts (Kashmir products, local seller badges)
 *
 * The `verbatim` flag marks answers reproduced word-for-word from the
 * existing SupportPage FAQ. Other answers paraphrase the cited policy
 * pages without adding external facts.
 */

export interface FAQItem {
  category: string;
  question: string;
  answer: string;
  /** True when the answer is reproduced verbatim from SupportPage.tsx. */
  verbatim?: boolean;
  /** Repository source(s) the answer is grounded in. */
  source: string;
}

export const FAQ_KNOWLEDGE: readonly FAQItem[] = [
  /* ------------------------------ Ordering ------------------------------ */
  {
    category: "Ordering",
    question: "How do I place an order?",
    answer:
      "Browse products, add items to your cart, and proceed to checkout. You can pay using available payment methods.",
    verbatim: true,
    source: "SupportPage.tsx",
  },
  {
    category: "Ordering",
    question: "How can I track my order?",
    answer:
      "Go to your account and open the Orders section to view real-time order status and tracking updates.",
    verbatim: true,
    source: "SupportPage.tsx",
  },
  {
    category: "Ordering",
    question: "Is my order confirmed as soon as I place it?",
    answer:
      "All orders are subject to product availability and vendor confirmation. Availability is not guaranteed until your order has been confirmed and payment captured.",
    source: "TermsAndConditionsPage.tsx §3/§5",
  },

  /* ------------------------------ Payments ------------------------------ */
  {
    category: "Payments",
    question: "What payment methods are available?",
    answer:
      "We support UPI, credit and debit cards, net banking, and wallets via our secure payment gateway.",
    verbatim: true,
    source: "SupportPage.tsx",
  },
  {
    category: "Payments",
    question: "Is my payment secure?",
    answer:
      "Yes. Payments use encrypted transactions through Razorpay and UPI, with Cash on Delivery also available. The exact amount is verified by our server before you are charged.",
    source: "AboutUsPage.tsx (Secure Payments), CheckoutPage.tsx",
  },
  {
    category: "Payments",
    question: "When do I have to pay?",
    answer:
      "Payment must be completed in full before an order is processed, except where Cash on Delivery is explicitly offered.",
    source: "TermsAndConditionsPage.tsx §3",
  },

  /* -------------------------------- COD -------------------------------- */
  {
    category: "COD",
    question: "Is Cash on Delivery available?",
    answer:
      "Cash on Delivery is available for many orders, but it depends on the product and your delivery location. Some items and some pincodes do not support COD.",
    source: "CartContext.tsx, CheckoutPage.tsx",
  },
  {
    category: "COD",
    question: "Why isn't COD available for my order?",
    answer:
      "COD is disabled when an item in your cart does not allow it, or when Cash on Delivery is not supported for your delivery pincode.",
    source: "CartContext.tsx (allowCod / serviceability), CheckoutPage.tsx",
  },
  {
    category: "COD",
    question: "How are refunds handled for COD orders?",
    answer:
      "For Cash on Delivery orders, refunds are credited to a UPI ID or bank account you provide.",
    source: "RefundReturnPolicyPage.tsx §6",
  },

  /* ------------------------------ Shipping ------------------------------ */
  {
    category: "Shipping",
    question: "How much does shipping cost?",
    answer:
      "Shipping is calculated for your delivery location at checkout. When there is no delivery surcharge for your area, shipping is shown as Free.",
    source: "CartContext.tsx, CheckoutPage.tsx",
  },
  {
    category: "Shipping",
    question: "Do you deliver to my area?",
    answer:
      "Deliverability is checked per product against your 6-digit pincode. If an item cannot be delivered to your location, you'll be asked to update your delivery location or remove the item before checkout.",
    source: "CartContext.tsx (serviceability), CheckoutPage.tsx",
  },

  /* ------------------------------ Delivery ------------------------------ */
  {
    category: "Delivery",
    question: "How do I track delivery?",
    answer:
      "Open the Orders section in your account for real-time order status and tracking updates, including tracking ID and shipping provider when available.",
    source: "SupportPage.tsx, order.ts (tracking fields)",
  },

  /* ------------------------------ Returns ------------------------------ */
  {
    category: "Returns",
    question: "What is the return policy?",
    answer:
      "Most products can be returned within 7 days of delivery. Perishable items such as saffron and dry fruits are non-returnable.",
    verbatim: true,
    source: "SupportPage.tsx / RefundReturnPolicyPage.tsx §2–§3",
  },
  {
    category: "Returns",
    question: "Which items cannot be returned?",
    answer:
      "Typically non-returnable: perishable goods (food, saffron, fresh produce), personalized or customized products, digital/downloadable content, items marked 'non-returnable', and innerwear/intimate items or consumables once opened.",
    source: "RefundReturnPolicyPage.tsx §3",
  },
  {
    category: "Returns",
    question: "How do I request a return?",
    answer:
      "Open your order from the Orders section, click 'Request Return' on the item, select a reason, upload supporting images or a short video if needed, and submit. The vendor (and, where necessary, the Koshur Kart team) reviews the request.",
    source: "RefundReturnPolicyPage.tsx §4–§5",
  },
  {
    category: "Returns",
    question: "When is a product eligible for return?",
    answer:
      "Items may be eligible if delivered damaged, delivered defective or not as described, the wrong item was received, or items are missing from a multi-product order. Requests should generally be raised within 7 days of delivery unless the vendor states otherwise.",
    source: "RefundReturnPolicyPage.tsx §2",
  },

  /* ------------------------------ Refunds ------------------------------ */
  {
    category: "Refunds",
    question: "How and when will I get my refund?",
    answer:
      "Once your return is approved and the product is received and verified, the refund is initiated to your original payment method where possible (COD refunds go to a UPI ID or bank account). Estimated times: UPI 3–7 business days, cards 5–10 business days, net banking/wallets 3–7 business days, COD 5–7 business days to UPI/bank.",
    source: "RefundReturnPolicyPage.tsx §6–§7",
  },
  {
    category: "Refunds",
    question: "Can I get a replacement instead of a refund?",
    answer:
      "Where applicable, eligible products may be replaced instead of refunded — subject to vendor policy, product availability, and serviceability in your area.",
    source: "RefundReturnPolicyPage.tsx §8",
  },

  /* ---------------------------- Cancellation ---------------------------- */
  {
    category: "Cancellation",
    question: "Can I cancel my order?",
    answer:
      "You can cancel any time before the order is shipped, free of charge. Once shipped, cancellation may no longer be available and the standard return process applies after delivery.",
    source: "RefundReturnPolicyPage.tsx §9",
  },

  /* ------------------------- Vendor verification ------------------------ */
  {
    category: "Vendor verification",
    question: "How do I become a vendor?",
    answer:
      "Click Sell Your Craft on the homepage and complete the vendor registration process.",
    verbatim: true,
    source: "SupportPage.tsx",
  },
  {
    category: "Vendor verification",
    question: "How are vendors verified?",
    answer:
      "Vendors complete a multi-step onboarding with KYC (business details, PAN, bank details, and documents). An admin reviews the submission; once approved, the store's verification status becomes verified and it can sell.",
    source: "docs/VENDOR_API.md, vendorOnboardingSchema.ts, vendorService.ts",
  },

  /* ------------------------- Authenticity ------------------------------- */
  {
    category: "Authenticity",
    question: "Are the products authentic?",
    answer:
      "Every seller is verified to ensure authenticity and quality, and Koshur Kart partners directly with artisans for authentic provenance. Products from Kashmir/Jammu vendors can carry 'From Kashmir' and 'Verified Local Seller' badges.",
    source: "AboutUsPage.tsx, StorySection.tsx, badgeRegistry.ts, regionUtils.ts",
  },
  {
    category: "Authenticity",
    question: "What does 'Verified Local Seller' mean?",
    answer:
      "It marks a verified local seller from Jammu & Kashmir — a Kashmir/Jammu vendor whose verification status and KYC are both approved.",
    source: "VerifiedLocalSellerBadge.tsx, regionUtils.ts",
  },

  /* --------------------------- Kashmir products ------------------------- */
  {
    category: "Kashmir products",
    question: "What kinds of Kashmiri products can I buy?",
    answer:
      "The catalog features authentic Kashmiri goods including Pashmina, Saffron, Dry Fruits, Walnut Wood, Papier-mâché, Kahwa, Handicrafts, Carpets, Kashmiri Wood Art, Kashmiri Apples, and more.",
    source: "categories.ts, KashmirCategories.tsx",
  },
  {
    category: "Kashmir products",
    question: "Where do the products come from?",
    answer:
      "Products carry the touch of Kashmiri craftspeople — such as a weaver in Srinagar, a saffron farmer in Pampore, and a wood carver in Shopian. Koshur Kart partners directly with artisans for fair earnings and authentic provenance.",
    source: "StorySection.tsx",
  },

  /* ------------------------------ Accounts ------------------------------ */
  {
    category: "Accounts",
    question: "How do I reset my password?",
    answer:
      "On the login page, click Forgot Password and follow the instructions sent to your registered email address.",
    verbatim: true,
    source: "SupportPage.tsx",
  },
  {
    category: "Accounts",
    question: "What are my responsibilities for my account?",
    answer:
      "Keep your account credentials confidential, provide accurate and up-to-date registration information, and you remain responsible for all activity under your account.",
    source: "TermsAndConditionsPage.tsx §2",
  },

  /* ------------------------------ Security ------------------------------ */
  {
    category: "Security",
    question: "What should I do if I notice unauthorized access?",
    answer:
      "Notify us immediately of any unauthorized access or suspected security breach by contacting support.",
    source: "TermsAndConditionsPage.tsx §2",
  },
  {
    category: "Security",
    question: "Will I be signed out automatically?",
    answer:
      "For your security, sessions time out after a period of inactivity and you'll be signed out automatically.",
    source: "useAuth.tsx (idle timeout)",
  },

  /* ------------------------------ Contact ------------------------------ */
  {
    category: "Contact",
    question: "How do I contact support?",
    answer:
      "Chat with us on WhatsApp (we typically reply within minutes) or email support — we respond within 24 hours. Include your order ID for faster assistance.",
    source: "SupportPage.tsx, supportConfig.ts",
  },
  {
    category: "Contact",
    question: "How do I contact a seller?",
    answer:
      "Visit the product page and use the seller contact option, or reach us via WhatsApp and we will connect you.",
    verbatim: true,
    source: "SupportPage.tsx",
  },
] as const;

/**
 * Support channels available to customers.
 * Source: src/pages/SupportPage.tsx, src/lib/supportConfig.ts.
 */
export const SUPPORT_CHANNELS = {
  email: "support@koshurkart.shop", // supportConfig.ts SUPPORT_EMAIL
  emailResponseTime: "within 24 hours",
  whatsapp: {
    available: true,
    responseTime: "typically within minutes",
    note: "WhatsApp number is configured via VITE_SUPPORT_WHATSAPP_NUMBER.",
  },
} as const;

/** Convenience type for consumers that need to reference the FAQ shape. */
export type FaqKnowledge = typeof FAQ_KNOWLEDGE;
