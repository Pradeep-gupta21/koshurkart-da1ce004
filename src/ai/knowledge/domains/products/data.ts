/**
 * KoshurKart — Product knowledge
 * =================================================================
 * Structured, provider-agnostic catalog facts for grounding AI
 * conversations about products, categories, and how the marketplace
 * models a product.
 *
 * SOURCE OF TRUTH: every value below is extracted *only* from content
 * that already exists in this repository. Primary sources:
 *   - src/config/categories.ts               (official categories: slug + label)
 *   - src/components/home/KashmirCategories.tsx (home-page category tiles / display labels)
 *   - src/components/layout/Footer.tsx        (featured materials/categories, tagline)
 *   - src/types/product.ts                    (the Product data model, statuses)
 *   - src/lib/validators/productSchema.ts     (product form constraints + status enum)
 *   - src/lib/badgeRegistry.ts                (product/marketplace badges)
 *   - src/components/product/FromKashmirBadge.tsx
 *   - src/components/product/VerifiedLocalSellerBadge.tsx
 *   - src/components/home/StorySection.tsx    (materials, artisan provenance)
 *
 * No external or invented facts are included. The repository defines a
 * single flat `category` field per product (no formal subcategory table),
 * so "subcategories" below are the finer display groupings that already
 * appear in the UI, and "materials" are the craft materials named in the
 * existing copy — not fabricated taxonomy.
 */

export const PRODUCT_KNOWLEDGE = {
  /**
   * Official marketplace categories — the canonical taxonomy.
   * `slug` is stored in `products.category` and used in URLs
   * (/search?category=<slug>). Source: src/config/categories.ts.
   */
  categories: [
    { slug: "pashmina", label: "Pashmina" },
    { slug: "saffron", label: "Saffron" },
    { slug: "dry_fruits", label: "Dry Fruits" },
    { slug: "walnut_wood", label: "Walnut Wood" },
    { slug: "papier_mache", label: "Papier-mâché" },
    { slug: "kahwa", label: "Kahwa" },
    { slug: "handicrafts", label: "Handicrafts" },
    { slug: "carpets", label: "Carpets" },
    { slug: "calligraphy_art", label: "Calligraphy Art" },
    { slug: "kashmiri_wood_art", label: "Kashmiri Wood Art" },
    { slug: "luxury_carpets_iranian_curtains", label: "Luxury Carpets & Iranian Curtains" },
    { slug: "traditional_clothing", label: "Traditional Clothing" },
    { slug: "arabic_hijabs_modest_wear", label: "Arabic Hijabs & Modest Wear" },
    { slug: "fine_art_photography", label: "Fine Art & Photography" },
    { slug: "artisanal_local_crafts", label: "Artisanal & Local Crafts" },
    { slug: "kashmiri_spices_kehsar", label: "Kashmiri Spices & Kehsar" },
    { slug: "kashmiri_apples", label: "World-Famous Kashmiri Apples" },
    { slug: "kashmiri_cherries_berries", label: "Fresh Kashmiri Cherries & Berries" },
  ],

  /**
   * Finer display labels / groupings that already appear in the UI for
   * some categories. The data model has no separate subcategory field;
   * these are the alternate display names surfaced to shoppers.
   * Source: src/components/home/KashmirCategories.tsx ("Treasures of the
   * Valley" tiles) and src/components/layout/Footer.tsx.
   */
  displayGroupings: {
    // Home-page category tiles use these display labels for the same slugs.
    pashmina: "Pashmina Shawls",
    kashmiri_cherries_berries: "Cherries & Berries",
    kashmiri_apples: "Kashmiri Apples",
    // Home-page "Treasures of the Valley" section title + subtitle.
    homeSectionTitle: "Treasures of the Valley",
    homeSectionSubtitle: "Curated categories from Kashmiri artisans",
    // Footer "Shop" quick links surface these as featured categories.
    footerFeaturedCategories: ["All Products", "Pashmina", "Saffron", "Dry Fruits"],
  },

  /**
   * Craft materials & goods named in existing marketplace copy. These are
   * the tangible materials/inputs the platform explicitly references —
   * not an invented material taxonomy.
   * Sources: src/components/layout/Footer.tsx, src/components/home/StorySection.tsx,
   * and material-bearing category labels in src/config/categories.ts.
   */
  materials: [
    "Pashmina", // fine Kashmiri shawl wool (Footer, categories)
    "Walnut Wood", // walnut wood carving (Footer, categories, "wood carver in Shopian")
    "Saffron", // Kashmiri saffron / Kehsar (Footer, StorySection "saffron farmer in Pampore")
    "Papier-mâché", // traditional Kashmiri craft (categories)
    "Carpets", // hand-knotted carpets (categories)
    "Iranian Curtains", // paired with luxury carpets (categories)
  ],

  /**
   * Origin / provenance references for craft goods, taken verbatim in
   * spirit from StorySection.tsx (the artisans and their regions).
   */
  provenance: {
    statement:
      "Every product carries the touch of a craftsperson — a weaver in Srinagar, a saffron farmer in Pampore, a wood carver in Shopian.",
    regions: ["Srinagar", "Pampore", "Shopian"],
    craftspeople: ["weaver", "saffron farmer", "wood carver"],
    // Footer tagline describing the catalog at large.
    tagline:
      "Authentic crafts and goods from the valley — Pashmina, walnut wood, saffron and more, delivered with care.",
  },

  /**
   * The Product data model as defined in src/types/product.ts. Documents
   * the fields the platform stores per product so an assistant can reason
   * about what information exists.
   */
  productModel: {
    /** Fields present on the Product interface (src/types/product.ts). */
    fields: [
      "id",
      "vendorId",
      "vendorName",
      "vendorPickupState", // used to derive "From Kashmir" / Verified Local Seller badges
      "title",
      "slug",
      "description",
      "images",
      "price",
      "discountPrice",
      "stock",
      "reservedStock",
      "lowStockThreshold",
      "category",
      "rating",
      "reviewCount",
      "isSponsored",
      "status",
      "createdAt",
      "salesCount",
      "viewCount",
      "trendingScore",
      "tags",
      "basePrice",
      "dynamicPrice",
      "demandScore",
      "allowCod",
    ],
    /**
     * Product lifecycle statuses. Source: productSchema.ts status enum.
     */
    statuses: ["active", "draft", "archived"],
    /**
     * Product form constraints. Source: src/lib/validators/productSchema.ts.
     */
    constraints: {
      titleMaxLength: 200,
      descriptionMaxLength: 5000,
      priceMustBePositive: true,
      discountPriceMustBePositive: true,
      stockMinimum: 0, // stock cannot be negative
      categoryRequired: true,
      imagesMustBeValidUrls: true,
    },
  },

  /**
   * Product & marketplace badges that can appear on listings.
   * Sources: src/lib/badgeRegistry.ts and the two product badge components.
   */
  badges: [
    { key: "from-kashmir", label: "From Kashmir" }, // FromKashmirBadge.tsx
    {
      key: "verified-local-seller",
      label: "Verified Local Seller",
      description: "Verified local seller from Jammu & Kashmir",
    }, // VerifiedLocalSellerBadge.tsx
    { key: "authentic-kashmir", label: "Authentic from Kashmir" }, // badgeRegistry.ts
    { key: "hard-to-get", label: "Hard to get in J&K — now available" }, // badgeRegistry.ts
    { key: "now-delivering", label: "Now delivering to {city}" }, // badgeRegistry.ts
  ],

  /**
   * Payment options that can affect a product listing (COD is a per-product
   * toggle via `allowCod`). Payment methods referenced across checkout/About.
   */
  paymentOptions: {
    // `allowCod` on the Product model gates Cash on Delivery per product.
    codIsPerProductToggle: true,
    methods: ["Razorpay", "UPI", "Cash on Delivery"],
  },
} as const;

/** Convenience type for consumers that need to reference the product shape. */
export type ProductKnowledge = typeof PRODUCT_KNOWLEDGE;
