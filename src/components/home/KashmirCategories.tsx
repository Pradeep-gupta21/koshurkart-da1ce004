import { Link } from "react-router-dom";
import { Gem, Shirt, Apple, Flame, Palette } from "lucide-react";

const categories = [
  { label: "Handicrafts", slug: "Handicrafts", Icon: Gem, tint: "from-accent/20 to-transparent" },
  { label: "Pashmina Shawls", slug: "Pashmina", Icon: Shirt, tint: "from-wood/25 to-transparent" },
  { label: "Dry Fruits", slug: "Dry Fruits", Icon: Apple, tint: "from-secondary/25 to-transparent" },
  { label: "Saffron", slug: "Saffron", Icon: Flame, tint: "from-accent/30 to-transparent" },
  { label: "Local Art", slug: "Art", Icon: Palette, tint: "from-primary/15 to-transparent" },
];

const KashmirCategories = () => (
  <section className="container mx-auto px-4 mt-12">
    <div className="mb-6">
      <h2 className="text-2xl font-serif font-semibold tracking-tight">Treasures of the Valley</h2>
      <p className="text-sm text-muted-foreground mt-1">Curated categories from Kashmiri artisans</p>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {categories.map(({ label, slug, Icon, tint }) => (
        <Link
          key={slug}
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
      ))}
    </div>
  </section>
);

export default KashmirCategories;
