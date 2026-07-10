/**
 * KoshurKart — Brand knowledge
 * =================================================================
 * Structured, provider-agnostic brand facts for grounding AI
 * conversations (system prompts, retrieval context, guardrails).
 *
 * SOURCE OF TRUTH: every value below is drawn *only* from content that
 * already exists in this repository. Primary sources:
 *   - src/pages/AboutUsPage.tsx  (Our Story, Mission, Vision, Core Values,
 *                                 Why Choose, For Customers, For Vendors)
 *   - src/components/home/StorySection.tsx  (artisan story, provenance)
 *   - src/config/categories.ts   (official marketplace categories)
 *   - src/lib/regionUtils.ts      (Kashmir / J&K locality definition)
 *
 * No external or invented facts are included. Quoted mission/vision
 * statements are reproduced verbatim from AboutUsPage.tsx.
 */

export const BRAND_KNOWLEDGE = {
  /** Official company / marketplace name. */
  companyName: "Koshur Kart",
  /** Positioning line used across the About page hero. */
  tagline: "Kashmir's Own Marketplace",
  /** One-line descriptor of what the platform is. */
  descriptor:
    "A trusted multi-vendor ecommerce marketplace connecting customers with quality products and empowering local sellers.",

  /**
   * Mission — reproduced verbatim from AboutUsPage.tsx ("Our Mission").
   */
  mission:
    "To empower businesses and provide customers with a secure, convenient, and enjoyable shopping experience.",

  /**
   * Vision — reproduced verbatim from AboutUsPage.tsx ("Our Vision").
   */
  vision:
    "To become a leading ecommerce marketplace that connects communities, supports entrepreneurs, and delivers exceptional customer experiences.",

  /**
   * Core values — the principles that guide everything Koshur Kart does.
   * Labels and descriptions taken from the `coreValues` list in AboutUsPage.tsx.
   */
  coreValues: [
    { name: "Trust", description: "Building relationships on honesty and reliability." },
    { name: "Transparency", description: "Clear policies, pricing, and communication." },
    { name: "Innovation", description: "Embracing technology to improve commerce." },
    { name: "Customer First", description: "Every decision starts with the customer experience." },
    { name: "Security", description: "Protecting data and transactions at every layer." },
    { name: "Growth", description: "Empowering vendors and enriching communities." },
  ],

  /**
   * Platform philosophy — the beliefs behind how the marketplace is built.
   * Drawn from the "Our Story" section of AboutUsPage.tsx.
   */
  platformPhilosophy: {
    summary:
      "Combining technology-driven commerce with a human touch to bring the best of the valley — and beyond — right to the customer's doorstep.",
    principles: [
      "Trust — the foundation of every relationship on the platform.",
      "Convenience — a reliable, seamless shopping experience.",
      "Accessibility — quality products and growth opportunities open to all.",
    ],
    // More than a marketplace: an intentional community of buyers and sellers.
    community:
      "Koshur Kart is built to be more than a marketplace — a community connecting local artisans, emerging brands, and discerning buyers.",
  },

  /**
   * Why KoshurKart exists — the founding purpose.
   * Synthesized only from AboutUsPage.tsx "Our Story" and StorySection.tsx.
   */
  whyWeExist: {
    origin:
      "Koshur Kart was created with the vision of building a trusted multi-vendor ecommerce platform where customers can discover quality products and vendors can grow their businesses.",
    purpose:
      "Born from a desire to bridge the gap between local artisans, emerging brands, and discerning buyers — building not just a marketplace, but a community.",
    // From StorySection.tsx: direct artisan partnership and provenance.
    artisanPromise:
      "Every product carries the touch of a craftsperson. Koshur Kart partners directly with artisans, ensuring fair earnings and authentic provenance — so that shopping keeps a centuries-old tradition alive.",
  },

  /**
   * Target customers and the benefits offered to them.
   * Benefits taken from the `customerBenefits` list in AboutUsPage.tsx.
   */
  targetCustomers: {
    description:
      "Discerning buyers seeking quality products — from local Kashmiri artisans to modern brands — with a secure and convenient shopping experience.",
    benefits: [
      "Wide product selection from local artisans to modern brands",
      "Competitive pricing with transparent cost breakdown",
      "Secure checkout with multiple payment options",
      "Real-time order tracking from dispatch to delivery",
      "Easy returns and refund policy for peace of mind",
    ],
  },

  /**
   * Target vendors and the benefits offered to them.
   * Benefits taken from the `vendorBenefits` list in AboutUsPage.tsx.
   * Vendor examples and locality come from StorySection.tsx and regionUtils.ts.
   */
  targetVendors: {
    description:
      "Local Kashmiri artisans and craftspeople — such as weavers in Srinagar, saffron farmers in Pampore, and wood carvers in Shopian — alongside emerging brands looking to grow their businesses.",
    // A vendor is treated as "local" when their pickup state is in Kashmir / Jammu (regionUtils.ts).
    localityKeywords: ["kashmir", "jammu"],
    benefits: [
      "Reach more customers across the valley and beyond",
      "Easy product management with intuitive dashboards",
      "Sales analytics and performance insights",
      "Marketing opportunities through native advertising",
      "Business growth tools to scale your operations",
    ],
  },

  /**
   * Long-term goals — the direction the platform is heading.
   * Derived from the Vision statement and community/entrepreneur themes.
   */
  longTermGoals: [
    "Become a leading ecommerce marketplace.",
    "Connect communities through commerce.",
    "Support entrepreneurs and empower local sellers.",
    "Deliver exceptional customer experiences.",
    "Enrich communities by helping vendors grow and scale.",
  ],

  /**
   * What makes KoshurKart different — the distinguishing characteristics.
   * All points are grounded in existing repository content (About page
   * "Why Choose" items, StorySection provenance, and the category catalog).
   */
  differentiators: [
    "Kashmir's own marketplace — rooted in the valley's heritage and craft.",
    "Direct partnership with artisans, ensuring fair earnings and authentic provenance.",
    "Verified vendors — every seller is checked for authenticity and quality.",
    "Verified Local Seller recognition for KYC-approved Kashmir / J&K vendors.",
    "Curated selection focused on genuine craftsmanship over mass-produced goods.",
    "Secure payments (Razorpay, UPI, and Cash on Delivery) with transparent pricing.",
    "A specialized catalog of authentic Kashmiri goods rather than generic inventory.",
  ],

  /**
   * Official marketplace categories — the specialized, Kashmir-centric
   * catalog that anchors the brand. Labels mirror src/config/categories.ts.
   */
  signatureCategories: [
    "Pashmina",
    "Saffron",
    "Dry Fruits",
    "Walnut Wood",
    "Papier-mâché",
    "Kahwa",
    "Handicrafts",
    "Carpets",
    "Calligraphy Art",
    "Kashmiri Wood Art",
    "Luxury Carpets & Iranian Curtains",
    "Traditional Clothing",
    "Arabic Hijabs & Modest Wear",
    "Fine Art & Photography",
    "Artisanal & Local Crafts",
    "Kashmiri Spices & Kehsar",
    "World-Famous Kashmiri Apples",
    "Fresh Kashmiri Cherries & Berries",
  ],
} as const;

/** Convenience type for consumers that need to reference the brand shape. */
export type BrandKnowledge = typeof BRAND_KNOWLEDGE;
