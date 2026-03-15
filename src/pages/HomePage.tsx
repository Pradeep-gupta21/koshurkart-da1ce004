import { Link } from "react-router-dom";
import { Star, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/product/ProductCard";
import { mockProducts, mockVendors } from "@/data/mock-data";
import heroBanner from "@/assets/hero-banner.jpg";

const HomePage = () => {
  const sponsoredProducts = mockProducts.filter(p => p.isSponsored);
  const trendingProducts = mockProducts.slice(4, 12);
  const allProducts = mockProducts.slice(0, 16);

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

      {/* Sponsored Carousel */}
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {sponsoredProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {trendingProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Featured Vendors */}
      <section className="container mx-auto px-4 mt-14">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Featured Vendors</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {mockVendors.map(vendor => (
            <div key={vendor.id} className="bg-card rounded-xl marketplace-shadow p-4 text-center hover:-translate-y-0.5 hover:marketplace-shadow-hover transition-all duration-200 cursor-pointer">
              <img src={vendor.logo} alt={vendor.storeName} className="h-14 w-14 rounded-full object-cover mx-auto mb-3" />
              <h3 className="text-sm font-medium">{vendor.storeName}</h3>
              <div className="flex items-center justify-center gap-1 mt-1">
                <Star className="h-3 w-3 fill-accent text-accent" />
                <span className="text-xs tabular-nums">{vendor.rating}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{vendor.totalSales.toLocaleString()} sales</p>
            </div>
          ))}
        </div>
      </section>

      {/* All Products */}
      <section className="container mx-auto px-4 mt-14">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold tracking-tight">All Products</h2>
          <Button variant="ghost" size="sm" className="text-primary" asChild>
            <Link to="/search">Browse All <ChevronRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {allProducts.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
