/**
 * KoshurKart — Kashmir heritage knowledge
 * =================================================================
 * Structured, provider-agnostic facts about the Kashmiri heritage,
 * artisan traditions, and crafts that KoshurKart represents. Intended
 * to ground AI conversations with authentic, on-brand context.
 *
 * SOURCE OF TRUTH: every value below is extracted *only* from content
 * that already exists in this repository. Primary sources:
 *   - src/components/home/StorySection.tsx   (artisan story, craftsmanship, provenance)
 *   - src/config/categories.ts               (heritage craft categories)
 *   - src/components/home/KashmirCategories.tsx ("Treasures of the Valley")
 *   - src/components/layout/Footer.tsx        (crafts of the valley, "Crafted in the valley")
 *   - src/lib/badgeRegistry.ts               ("Authentic from Kashmir", "Hard to get in J&K")
 *   - src/pages/AboutUsPage.tsx              ("Kashmir's Own Marketplace", "best of the valley")
 *   - src/lib/regionUtils.ts                 (Kashmir / Jammu regional identity)
 *
 * IMPORTANT — faithfulness note:
 * Several crafts commonly associated with Kashmir are NOT described
 * anywhere in this repository. Per the "use only repository content"
 * constraint, they are deliberately NOT fabricated here; they are listed
 * under `notInRepository` so the AI layer knows the platform's own
 * material does not (yet) cover them. Do not assert facts about those
 * topics as if sourced from KoshurKart.
 */

export const HERITAGE_KNOWLEDGE = {
  /**
   * Kashmir heritage — the overarching positioning and cultural framing.
   * Sources: AboutUsPage.tsx, StorySection.tsx, Footer.tsx.
   */
  kashmirHeritage: {
    positioning: "Kashmir's Own Marketplace.", // AboutUsPage hero
    valleyPromise: "Bringing the best of the valley — and beyond — to the customer's doorstep.", // AboutUsPage
    craftedInTheValley: "Crafted in the valley.", // Footer
    rootedInHeritage: "Rooted in the valley's heritage and craft.",
  },

  /**
   * Artisan traditions.
   * Source: src/components/home/StorySection.tsx.
   */
  artisanTraditions: {
    // Verbatim story from the home page.
    story:
      "Every product on Koshur Kart carries the touch of a craftsperson — a weaver in Srinagar, a saffron farmer in Pampore, a wood carver in Shopian.",
    // "Dastkar" — highlighted on the home page as the Kashmiri word for artisan.
    dastkar: {
      term: "Dastkar",
      meaning: "the true Kashmiri word for artisan",
    },
    // Named artisan roles and their regions (StorySection.tsx).
    craftspeople: [
      { role: "weaver", region: "Srinagar" },
      { role: "saffron farmer", region: "Pampore" },
      { role: "wood carver", region: "Shopian" },
    ],
    regions: ["Srinagar", "Pampore", "Shopian"],
    directPartnership:
      "Koshur Kart partners directly with artisans, ensuring fair earnings and authentic provenance.",
    callToAction: "Meet Our Artisans.", // StorySection button
  },

  /**
   * Craftsmanship.
   * Sources: StorySection.tsx, Footer.tsx.
   */
  craftsmanship: {
    handmade: "Handmade with Love in Kashmir.", // StorySection heading
    touchOfACraftsperson: "Every product carries the touch of a craftsperson.",
    authenticCrafts:
      "Authentic crafts and goods from the valley — Pashmina, walnut wood, saffron and more, delivered with care.", // Footer
  },

  /**
   * Cultural significance & preservation of culture.
   * Source: src/components/home/StorySection.tsx.
   */
  culturalSignificance: {
    preservation:
      "When you shop here, you don't just buy a product — you keep a centuries-old tradition alive.",
    traditionAlive: "Shopping on Koshur Kart keeps a centuries-old tradition alive.",
  },

  /**
   * Heritage crafts that ARE represented in the repository (as marketplace
   * categories and/or referenced craft materials). Labels mirror
   * src/config/categories.ts and src/components/home/KashmirCategories.tsx.
   */
  heritageCrafts: [
    {
      name: "Pashmina",
      categorySlug: "pashmina",
      displayLabel: "Pashmina Shawls",
      note: "Featured craft/material of the valley (Footer, categories).",
    },
    {
      name: "Papier-mâché",
      categorySlug: "papier_mache",
      displayLabel: "Papier-mâché",
      note: "Traditional Kashmiri craft category.",
    },
    {
      name: "Walnut Wood Carving",
      categorySlug: "walnut_wood",
      displayLabel: "Walnut Wood",
      relatedCategory: { slug: "kashmiri_wood_art", label: "Kashmiri Wood Art" },
      note: "Walnut wood + 'wood carver in Shopian' (StorySection); also 'Kashmiri Wood Art' category.",
    },
    {
      name: "Carpets",
      categorySlug: "carpets",
      displayLabel: "Carpets",
      relatedCategory: {
        slug: "luxury_carpets_iranian_curtains",
        label: "Luxury Carpets & Iranian Curtains",
      },
      note: "Carpet categories exist; the repository does NOT specify a 'hand-knotted' technique.",
    },
    {
      name: "Calligraphy Art",
      categorySlug: "calligraphy_art",
      displayLabel: "Calligraphy Art",
      note: "Art category in the marketplace catalog.",
    },
    {
      name: "Handicrafts",
      categorySlug: "handicrafts",
      displayLabel: "Handicrafts",
      note: "General handicrafts category.",
    },
    {
      name: "Artisanal & Local Crafts",
      categorySlug: "artisanal_local_crafts",
      displayLabel: "Artisanal & Local Crafts",
      note: "Umbrella craft category.",
    },
    {
      name: "Traditional Clothing",
      categorySlug: "traditional_clothing",
      displayLabel: "Traditional Clothing",
      note: "Traditional attire category.",
    },
    {
      name: "Saffron",
      categorySlug: "saffron",
      displayLabel: "Saffron",
      note: "Kashmiri saffron; 'saffron farmer in Pampore' (StorySection).",
    },
  ],

  /**
   * Regional identity.
   * Sources: src/lib/regionUtils.ts, src/lib/badgeRegistry.ts, product badges.
   */
  regionalIdentity: {
    region: "Kashmir / Jammu (J&K).",
    localityKeywords: ["kashmir", "jammu"],
    derivation:
      "A vendor is 'local' when their pickup_state contains 'kashmir' or 'jammu' (isKashmirVendor).",
    badges: [
      { badge: "From Kashmir", meaning: "Product is from a Kashmir/Jammu vendor." },
      { badge: "Authentic from Kashmir", meaning: "Authenticity signal (badge registry)." },
      {
        badge: "Verified Local Seller",
        meaning: "Verified local seller from Jammu & Kashmir.",
      },
      {
        badge: "Hard to get in J&K — now available",
        meaning: "Scarcity/availability signal (badge registry).",
      },
    ],
    valleyReferences: ["the valley", "Kashmir", "Jammu & Kashmir", "J&K"],
    homeSection: {
      title: "Treasures of the Valley",
      subtitle: "Curated categories from Kashmiri artisans",
    },
  },

  /**
   * Requested heritage topics that have NO supporting content anywhere in
   * this repository. Per the "use only repository content" constraint,
   * these are intentionally left unpopulated rather than fabricated.
   * The AI layer should treat them as "not covered by KoshurKart's own
   * material" and avoid asserting platform-sourced claims about them.
   */
  notInRepository: [
    "GI-tagged products / Geographical Indication",
    "Sozni embroidery",
    "Chain stitch",
    "Copperware",
    "Willow wicker",
    "Sustainability (no repository content found)",
    "Hand-knotted carpet technique (only generic 'Carpets' categories exist)",
  ],
} as const;

/** Convenience type for consumers that need to reference the heritage shape. */
export type HeritageKnowledge = typeof HERITAGE_KNOWLEDGE;
