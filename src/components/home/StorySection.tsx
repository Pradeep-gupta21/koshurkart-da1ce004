import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

const StorySection = () => (
  <section className="container mx-auto px-4 mt-16">
    <div className="grid md:grid-cols-2 gap-0 rounded-3xl overflow-hidden border border-wood marketplace-shadow">
      {/* Left: Story */}
      <div className="bg-card p-8 md:p-12 flex flex-col justify-center">
        <span className="text-accent font-sans font-semibold text-xs tracking-[0.2em] mb-3 uppercase flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 fill-accent" /> Our Story
        </span>
        <h2 className="text-3xl md:text-4xl font-serif font-semibold tracking-tight leading-[1.1]">
          Handmade with Love<br />
          <span className="italic text-accent">in Kashmir</span>
        </h2>
        <p className="mt-5 text-sm md:text-base text-muted-foreground leading-relaxed">
          Every product on Kashmir Bazaar carries the touch of a craftsperson — a weaver in Srinagar, a saffron
          farmer in Pampore, a wood carver in Shopian. We partner directly with artisans, ensuring fair earnings
          and authentic provenance.
        </p>
        <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
          When you shop here, you don't just buy a product — you keep a centuries-old tradition alive.
        </p>
        <div className="mt-7">
          <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" asChild>
            <Link to="/search">Meet Our Artisans</Link>
          </Button>
        </div>
      </div>

      {/* Right: Visual */}
      <div className="relative bg-dusk bg-paisley min-h-[280px] md:min-h-0 flex items-center justify-center p-12">
        <div className="relative z-10 text-center">
          <div className="text-6xl md:text-7xl font-serif font-semibold text-[hsl(210_40%_98%)] italic leading-none">
            "Karkhandar"
          </div>
          <p className="mt-4 text-[hsl(210_40%_98%)]/70 text-sm tracking-wide">
            — the Kashmiri word for craftsperson
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent/20 border border-accent/40 px-3 py-1 text-accent text-xs font-semibold backdrop-blur-sm">
            500+ verified artisans
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default StorySection;
