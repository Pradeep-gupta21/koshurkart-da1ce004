import { useState } from "react";
import { Link } from "react-router-dom";
import { Gem, Shirt, Apple, Flame, Palette, PenTool, Hammer, Layers, Sparkles, Camera, Brush, Soup, Cherry, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const categories = [
  { label: "Pashmina Shawls", slug: "pashmina", Icon: Shirt, tint: "from-wood/25 to-transparent" },
  { label: "Saffron", slug: "saffron", Icon: Flame, tint: "from-accent/30 to-transparent" },
  { label: "Dry Fruits", slug: "dry_fruits", Icon: Apple, tint: "from-secondary/25 to-transparent" },
  { label: "Handicrafts", slug: "handicrafts", Icon: Gem, tint: "from-accent/20 to-transparent" },
  { label: "Papier-mâché", slug: "papier_mache", Icon: Palette, tint: "from-primary/15 to-transparent" },
  { label: "Calligraphy Art", slug: "calligraphy_art", Icon: PenTool, tint: "from-primary/20 to-transparent" },
  { label: "Kashmiri Wood Art", slug: "kashmiri_wood_art", Icon: Hammer, tint: "from-wood/30 to-transparent" },
  { label: "Luxury Carpets & Iranian Curtains", slug: "luxury_carpets_iranian_curtains", Icon: Layers, tint: "from-accent/25 to-transparent" },
  { label: "Traditional Clothing", slug: "traditional_clothing", Icon: Shirt, tint: "from-secondary/20 to-transparent" },
  { label: "Arabic Hijabs & Modest Wear", slug: "arabic_hijabs_modest_wear", Icon: Sparkles, tint: "from-primary/20 to-transparent" },
  { label: "Fine Art & Photography", slug: "fine_art_photography", Icon: Camera, tint: "from-wood/20 to-transparent" },
  { label: "Artisanal & Local Crafts", slug: "artisanal_local_crafts", Icon: Brush, tint: "from-accent/20 to-transparent" },
  { label: "Kashmiri Spices & Kehsar", slug: "kashmiri_spices_kehsar", Icon: Soup, tint: "from-accent/30 to-transparent" },
  { label: "Kashmiri Apples", slug: "kashmiri_apples", Icon: Apple, tint: "from-secondary/30 to-transparent" },
  { label: "Cherries & Berries", slug: "kashmiri_cherries_berries", Icon: Cherry, tint: "from-accent/25 to-transparent" },
];

const MOBILE_PREVIEW_COUNT = 4;

const CategoryTile = ({ label, slug, Icon, tint }: typeof categories[number]) => (
  <Link
    to={`/search?category=${encodeURIComponent(slug)}`}
    className="group relative overflow-hidden rounded-2xl border border-wood bg-card p-6 marketplace-shadow transition-all duration-300 hover:scale-[1.02] hover:marketplace-shadow-hover hover:ring-1 hover:ring-accent/40"
  >
    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tint}`} />
    <div className="relative flex flex-col items-center text-center gap-3">
      <div className="h-12 w-12 rounded-full bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent/20 transition-colors">
        <Icon className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <h3 className="font-serif text-base font-semibold tracking-tight">{label}</h3>
    </div>
  </Link>
);

const KashmirCategories = () => {
  const [expanded, setExpanded] = useState(false);
  const previewCategories = categories.slice(0, MOBILE_PREVIEW_COUNT);
  const restCategories = categories.slice(MOBILE_PREVIEW_COUNT);

  return (
    <section className="container mx-auto px-4 mt-12">
      <div className="mb-6">
        <h2 className="text-2xl font-serif font-semibold tracking-tight">Treasures of the Valley</h2>
        <p className="text-sm text-muted-foreground mt-1">Curated categories from Kashmiri artisans</p>
      </div>

      {/* Mobile: compact 2x2 with expand */}
      <div className="sm:hidden">
        <div className="grid grid-cols-2 gap-3">
          {previewCategories.map((c) => (
            <CategoryTile key={c.slug} {...c} />
          ))}
        </div>
        <div
          className={`grid grid-cols-2 gap-3 overflow-hidden transition-all duration-500 ease-out ${
            expanded ? "max-h-[4000px] opacity-100 mt-3" : "max-h-0 opacity-0"
          }`}
        >
          {restCategories.map((c) => (
            <CategoryTile key={c.slug} {...c} />
          ))}
        </div>
        <div className="mt-5 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full px-5 border-accent/40 text-foreground hover:bg-accent/10"
            aria-expanded={expanded}
          >
            {expanded ? "Show Less" : "View All Categories"}
            <ChevronDown
              className={`ml-1.5 h-4 w-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Desktop/Tablet: unchanged */}
      <div className="hidden sm:grid grid-cols-3 lg:grid-cols-5 gap-4">
        {categories.map((c) => (
          <CategoryTile key={c.slug} {...c} />
        ))}
      </div>
    </section>
  );
};

export default KashmirCategories;
