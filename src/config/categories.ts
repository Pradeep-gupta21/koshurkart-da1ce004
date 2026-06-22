// Official Koshur Kart marketplace categories.
// `slug` is the canonical identifier stored in the products.category column
// and used in URLs (/search?category=<slug>). `label` is the display name.

export interface MarketplaceCategory {
  slug: string;
  label: string;
}

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
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
];

export const CATEGORY_SLUGS = MARKETPLACE_CATEGORIES.map((c) => c.slug);

const SLUG_TO_LABEL = new Map(MARKETPLACE_CATEGORIES.map((c) => [c.slug, c.label]));

/** Format a stored category slug into a human-readable label. Falls back to a
 *  title-cased version of the slug for legacy values not in the official list. */
export const formatCategoryLabel = (slug?: string | null): string => {
  if (!slug) return "";
  const known = SLUG_TO_LABEL.get(slug);
  if (known) return known;
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};
