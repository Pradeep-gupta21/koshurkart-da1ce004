import { Link } from "react-router-dom";
import { Star, ChevronRight, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/product/ProductCard";
import ProductGrid from "@/components/product/ProductGrid";
import SponsoredProductCard from "@/components/product/SponsoredProductCard";
import { productService } from "@/services/productService";
import { adService } from "@/services/adService";
import heroBanner from "@/assets/hero-banner.jpg";
import type { Product } from "@/types";

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
  const { data: sponsoredCampaigns = [] } = useQuery({
    queryKey: ['ads', 'homepage'],
    queryFn: () => adService.getAuctionWinners('homepage', 4),
  });

  const { data: trendingProducts = [], isLoading: loadingTrending } = useQuery({
    queryKey: ['products', 'trending'],
    queryFn: () => productService.getTrending(8),
  });

  const { data: allProducts = [], isLoading: loadingAll } = useQuery({
    queryKey: ['products', 'ranked'],
    queryFn: () => productService.getRanked({ limit: 16 }),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', 'featured'],
    queryFn: () => productService.getVendors(),
  });

  const sponsoredProducts = sponsoredCampaigns.map(mapAuctionWinnerToProduct);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl mx-4 mt-4 lg:mx-0">
        <div className="relative h-[340px] md:h-[420px] overflow-hidden rounded-2xl">
          <img src={heroBanner} alt="Nexus Market" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/50 to-transparent" />
          <div className="relative z-10 flex flex-col justify-center h-full px-8 md:px-12 max-w-xl">
            <span className="text-accent font-semibold text-sm mb-2">NEW SEASON</span>
            <h1 className="text-3xl md:text-5xl font-bold text-background leading-tight">
              Discover Premium Products
            </h1>
            <p className="mt-3 text-background/70 text-sm md:text-base max-w-md">
              Shop from thousands of verified vendors. Quality guaranteed, delivered to your doorstep.
            </p>
            <div className="mt-6 flex gap-3">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" asChild>
                <Link to="/search">Shop Now</Link>
              </Button>
              <Button size="lg" variant="outline" className="border-background/30 text-background hover:bg-background/10" asChild>
                <Link to="/vendor">Start Selling</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

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
            <h2 className="text-xl font-semibold tracking-tight">Featured Vendors</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {vendors.map((vendor: any) => (
              <div key={vendor.id} className="bg-card rounded-xl marketplace-shadow p-4 text-center hover:-translate-y-0.5 hover:marketplace-shadow-hover transition-all duration-200 cursor-pointer">
                {vendor.logo ? (
                  <img src={vendor.logo} alt={vendor.store_name} className="h-14 w-14 rounded-full object-cover mx-auto mb-3" />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-lg font-bold text-muted-foreground">
                    {vendor.store_name?.[0]}
                  </div>
                )}
                <h3 className="text-sm font-medium flex items-center justify-center gap-1">
                  {vendor.store_name}
                  {vendor.is_verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                </h3>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Star className="h-3 w-3 fill-accent text-accent" />
                  <span className="text-xs tabular-nums">{vendor.rating ?? 0}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{(vendor.total_sales ?? 0).toLocaleString()} sales</p>
              </div>
            ))}
          </div>
        </section>
      )}

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
