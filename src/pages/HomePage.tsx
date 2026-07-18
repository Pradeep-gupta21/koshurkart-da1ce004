import { Link } from "react-router-dom";
import { Star, ChevronRight, ShieldCheck, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/product/ProductCard";
import ProductGrid from "@/components/product/ProductGrid";
import SponsoredProductCard from "@/components/product/SponsoredProductCard";
import { ServiceFactory } from "@/services/commerce/di/ServiceFactory";
import { adService } from "@/services/adService";
import { useAuth } from "@/hooks/useAuth";
import { useLocation as useUserLocation } from "@/contexts/LocationContext";
import hero640 from "@/assets/hero/hero-banner-640.jpg";
import hero960 from "@/assets/hero/hero-banner-960.jpg";
import hero1280 from "@/assets/hero/hero-banner-1280.jpg";
import hero1600 from "@/assets/hero/hero-banner-1600.jpg";
import hero1796 from "@/assets/hero/hero-banner-1796.jpg";
import type { Product } from "@/types";
import LocalDeals from "@/components/home/LocalDeals";
import RegionRecommendations from "@/components/home/RegionRecommendations";
import KashmirCategories from "@/components/home/KashmirCategories";
import StorySection from "@/components/home/StorySection";
import FromKashmirBadge from "@/components/product/FromKashmirBadge";
import RecentlyViewedSection from "@/components/home/RecentlyViewedSection";

const mapAuctionWinnerToProduct = (c: any): Product & { campaignId: string } => ({
  campaignId: c.campaign_id,
  id: c.product_id,
  title: c.title,
  slug: c.slug,
  price: Number(c.price),
  discountPrice: c.discount_price ? Number(c.discount_price) : undefined,
  images: c.images ?? [],
  rating: Number(c.rating ?? 0),
  reviewCount: c.review_count ?? 0,
  category: c.category,
  vendorId: c.vendor_id,
  vendorName: c.store_name ?? "",
  stock: 0,
  reservedStock: 0,
  lowStockThreshold: 5,
  description: "",
  status: "active",
  isSponsored: true,
  createdAt: c.created_at ?? "",
  salesCount: 0,
  viewCount: 0,
  trendingScore: 0,
});

const HomePage = () => {
  const { user } = useAuth();
  const { userState } = useUserLocation();

  const { data: sponsoredCampaigns = [] } = useQuery({
    queryKey: ['ads', 'homepage'],
    queryFn: () => adService.getAuctionWinners('homepage', 4),
  });

  const { data: recommendedProducts = [], isLoading: loadingRecommended } = useQuery({
    queryKey: ['products', 'ai-recommended', user?.id],
    queryFn: async () => {
      const result = await ServiceFactory.getRecommendationService().getSmartRecommendations(user!.id, 8);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!user?.id,
  });

  const { data: becauseYouViewed } = useQuery({
    queryKey: ['products', 'because-viewed', user?.id],
    queryFn: async () => {
      const result = await ServiceFactory.getRecommendationService().getBecauseYouViewed(user!.id, 4);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!user?.id,
  });

  const { data: trendingProducts = [], isLoading: loadingTrending } = useQuery({
    queryKey: ['products', 'trending'],
    queryFn: async () => {
      const result = await ServiceFactory.getProductService().getTrending(8);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
  });

  const { data: allProducts = [], isLoading: loadingAll } = useQuery({
    queryKey: ['products', 'ranked', userState ?? ''],
    queryFn: async () => {
      const result = await ServiceFactory.getProductService().getRanked({ limit: 16, userState });
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', 'featured'],
    queryFn: async () => {
      const result = await ServiceFactory.getProductService().getVendors();
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
  });

  const sponsoredProducts = sponsoredCampaigns.map(mapAuctionWinnerToProduct);

  return (
    <div className="w-full overflow-x-hidden">
      {/* Hero — Dal Lake at dusk */}
      <section className="relative overflow-hidden rounded-2xl mx-4 mt-4 lg:mx-0">
        <div className="relative h-[360px] md:h-[460px] overflow-hidden rounded-2xl bg-dusk bg-paisley">
          <img
            src={hero1280}
            srcSet={`${hero640} 640w, ${hero960} 960w, ${hero1280} 1280w, ${hero1600} 1600w, ${hero1796} 1796w`}
            sizes="(min-width: 1024px) 1280px, (min-width: 768px) 100vw, 100vw"
            alt="Authentic Kashmiri crafts — pashmina shawl, samovar, walnut wood box and dry fruits."
            width={1796}
            height={876}
            loading="eager"
            decoding="async"
            // @ts-expect-error fetchpriority is a valid HTML attribute not yet typed in React
            fetchpriority="high"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(222_47%_8%)]/80 via-[hsl(222_47%_8%)]/40 to-transparent" />
          <div className="relative z-10 flex flex-col justify-center h-full px-5 sm:px-8 md:px-14 max-w-2xl">
            <span className="text-accent font-sans font-semibold text-xs tracking-[0.2em] mb-3 uppercase">
              From the Valley
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-serif font-semibold text-[hsl(210_40%_98%)] leading-[1.1]">
              Discover Kashmir's<br />
              <span className="text-accent italic">Finest Products</span>
            </h1>
            <p className="mt-4 text-[hsl(210_40%_98%)]/75 text-sm md:text-base max-w-lg leading-relaxed">
              Pashmina, saffron, walnut wood and more — handpicked from verified Kashmiri artisans, shipped across India and worldwide.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold shadow-lg shadow-accent/20 w-full sm:w-auto" asChild>
                <Link to="/search">Explore Now</Link>
              </Button>
              <Button size="lg" variant="outline" className="border-[hsl(210_40%_98%)]/30 text-[hsl(210_40%_98%)] hover:bg-[hsl(210_40%_98%)]/10 hover:text-[hsl(210_40%_98%)] w-full sm:w-auto" asChild>
                <Link to="/vendor">Sell Your Craft</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Kashmir Categories */}
      <KashmirCategories />

      {/* Local Deals (region-aware, horizontal scroll) */}
      <LocalDeals />

      {/* Region-aware recommendations */}
      <RegionRecommendations />

      {/* Sponsored */}
      {sponsoredProducts.length > 0 && (
        <section className="container mx-auto px-4 mt-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Sponsored Products</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Featured picks from top vendors</p>
            </div>
            <Button variant="ghost" size="sm" className="text-primary" asChild>
              <Link to="/search">View All <ChevronRight className="h-4 w-4 ml-1" /></Link>
            </Button>
          </div>
          <ProductGrid>
            {sponsoredProducts.map((p) => (
              <SponsoredProductCard key={p.campaignId} product={p} campaignId={p.campaignId} />
            ))}
          </ProductGrid>
        </section>
      )}

      {/* Recommended for You (AI-scored) */}
      {user && (
        <section className="container mx-auto px-4 mt-14">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Recommended for You</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Personalized picks based on your activity</p>
            </div>
          </div>
          <ProductGrid loading={loadingRecommended}>
            {recommendedProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ProductGrid>
        </section>
      )}

      {/* Because You Viewed */}
      {becauseYouViewed && becauseYouViewed.products.length > 0 && (
        <section className="container mx-auto px-4 mt-14">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Because You Viewed "{becauseYouViewed.contextProductTitle}"
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">Similar items you might like</p>
              </div>
            </div>
          </div>
          <ProductGrid>
            {becauseYouViewed.products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ProductGrid>
        </section>
      )}

      {/* Recently Viewed (auth + guest) */}
      <RecentlyViewedSection />

      {/* Trending */}
      <section className="container mx-auto px-4 mt-14">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Trending Now</h2>
            <p className="text-sm text-muted-foreground mt-0.5">What everyone's buying</p>
          </div>
          <Button variant="ghost" size="sm" className="text-primary" asChild>
            <Link to="/search">View All <ChevronRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>
        <ProductGrid loading={loadingTrending}>
          {trendingProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ProductGrid>
      </section>

      {/* Featured Vendors */}
      {vendors.length > 0 && (
        <section className="container mx-auto px-4 mt-14">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-serif font-semibold tracking-tight">Artisans of the Valley</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {vendors.map((vendor: any) => (
              <div key={vendor.id} className="bg-card rounded-xl border border-wood marketplace-shadow p-4 text-center hover:-translate-y-0.5 hover:marketplace-shadow-hover transition-all duration-200 cursor-pointer">
                {vendor.logo ? (
                  <img
                    src={vendor.logo}
                    alt={vendor.store_name}
                    width={56}
                    height={56}
                    loading="lazy"
                    decoding="async"
                    className="h-14 w-14 rounded-full object-cover mx-auto mb-3"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-lg font-bold text-muted-foreground">
                    {vendor.store_name?.[0]}
                  </div>
                )}
                <h3 className="text-sm font-medium flex items-center justify-center gap-1">
                  {vendor.store_name}
                  {vendor.is_verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                </h3>
                <div className="mt-1.5 flex justify-center">
                  <FromKashmirBadge />
                </div>
                <div className="flex items-center justify-center gap-1 mt-2">
                  <Star className="h-3 w-3 fill-accent text-accent" />
                  <span className="text-xs tabular-nums">{vendor.rating ?? 0}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{(vendor.total_sales ?? 0).toLocaleString()} sales</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Story Section */}
      <StorySection />

      {/* All Products */}
      <section className="container mx-auto px-4 mt-14 pb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold tracking-tight">All Products</h2>
          <Button variant="ghost" size="sm" className="text-primary" asChild>
            <Link to="/search">Browse All <ChevronRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>
        <ProductGrid loading={loadingAll} skeletonCount={16}>
          {allProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ProductGrid>
      </section>
    </div>
  );
};

export default HomePage;
