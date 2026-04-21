import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X, SearchX, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import ProductCard from "@/components/product/ProductCard";
import SponsoredProductCard from "@/components/product/SponsoredProductCard";
import ProductGrid from "@/components/product/ProductGrid";
import EmptyState from "@/components/ui/EmptyState";
import { productService } from "@/services/productService";
import { searchService, type SearchSortOption, type SearchFilters } from "@/services/searchService";
import { adService } from "@/services/adService";
import { useServiceability } from "@/hooks/useServiceability";
import { useLocation as useUserLocation } from "@/contexts/LocationContext";
import { Truck } from "lucide-react";
import type { Product } from "@/types";

const defaultCategories = ["Electronics", "Fashion", "Home & Living", "Sports", "Beauty", "Books"];

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

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialCategory = searchParams.get("category") || "All";

  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState<SearchSortOption>("relevance");
  const [showFilters, setShowFilters] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [minRating, setMinRating] = useState<number>(0);
  const [deliverableOnly, setDeliverableOnly] = useState(false);

  // Sync URL params
  useEffect(() => {
    const q = searchParams.get("q") || "";
    const cat = searchParams.get("category") || "All";
    setQuery(q);
    setSelectedCategory(cat);
  }, [searchParams]);

  // Save to history on search
  useEffect(() => {
    if (initialQuery) {
      searchService.saveSearchQuery(initialQuery);
    }
  }, [initialQuery]);

  const { data: dbCategories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => productService.getCategories(),
  });

  const categories = ["All", ...(dbCategories.length > 0 ? dbCategories : defaultCategories)];

  const filters: SearchFilters = {
    category: selectedCategory !== "All" ? selectedCategory : undefined,
    priceMin: priceRange[0] > 0 ? priceRange[0] : undefined,
    priceMax: priceRange[1] < 10000 ? priceRange[1] : undefined,
    minRating: minRating > 0 ? minRating : undefined,
  };

  const { userState } = useUserLocation();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "search", query, selectedCategory, sortBy, priceRange[0], priceRange[1], minRating, userState ?? ""],
    queryFn: () => searchService.searchProducts(query, filters, sortBy, 30, userState),
  });

  const { data: sponsoredCampaigns = [] } = useQuery({
    queryKey: ["ads", "search"],
    queryFn: () => adService.getAuctionWinners("search", 6),
  });

  const sponsoredAds = sponsoredCampaigns.map(mapAuctionWinnerToProduct);

  // Batched serviceability for current results
  const productIds = products.map((p) => p.id);
  const { pincode, map: serviceabilityMap } = useServiceability(productIds);

  // Apply deliverable-only filter + sort deliverable first
  const filteredProducts = (() => {
    if (!pincode) return products;
    const list = deliverableOnly
      ? products.filter((p) => serviceabilityMap.get(p.id)?.deliverable !== false)
      : [...products];
    // Sort deliverable items first
    list.sort((a, b) => {
      const da = serviceabilityMap.get(a.id)?.deliverable === false ? 1 : 0;
      const db = serviceabilityMap.get(b.id)?.deliverable === false ? 1 : 0;
      return da - db;
    });
    return list;
  })();

  const activeFilterCount = [
    selectedCategory !== "All",
    priceRange[0] > 0 || priceRange[1] < 10000,
    minRating > 0,
    deliverableOnly,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedCategory("All");
    setPriceRange([0, 10000]);
    setMinRating(0);
    setSortBy("relevance");
    setDeliverableOnly(false);
  };

  // Intersperse sponsored ads
  const interspersed: React.ReactNode[] = [];
  let adIndex = 0;
  filteredProducts.forEach((product, i) => {
    if (i > 0 && i % 4 === 0 && adIndex < sponsoredAds.length) {
      const ad = sponsoredAds[adIndex];
      interspersed.push(
        <SponsoredProductCard key={`ad-${ad.campaignId}`} product={ad} campaignId={ad.campaignId} />
      );
      adIndex++;
    }
    interspersed.push(<ProductCard key={product.id} product={product} />);
  });
  while (adIndex < sponsoredAds.length) {
    const ad = sponsoredAds[adIndex];
    interspersed.push(
      <SponsoredProductCard key={`ad-${ad.campaignId}`} product={ad} campaignId={ad.campaignId} />
    );
    adIndex++;
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Search bar */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-10 h-11"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button variant="outline" className="h-11 gap-2 relative" onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-6 p-4 bg-muted/50 rounded-xl animate-fade-in space-y-4">
          {/* Categories */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Category</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  size="sm"
                  variant={selectedCategory === cat ? "default" : "outline"}
                  onClick={() => setSelectedCategory(cat)}
                  className="h-8 text-xs"
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Price Range: ${priceRange[0]} — {priceRange[1] >= 10000 ? "Any" : `$${priceRange[1]}`}
            </p>
            <Slider
              min={0}
              max={10000}
              step={50}
              value={priceRange}
              onValueChange={(v) => setPriceRange(v as [number, number])}
              className="max-w-md"
            />
          </div>

          {/* Min Rating */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Minimum Rating</p>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((r) => (
                <button
                  key={r}
                  onClick={() => setMinRating(minRating === r + 1 ? 0 : r + 1)}
                  className="p-1 rounded-md hover:bg-muted transition-colors"
                >
                  <Star
                    className={`h-5 w-5 ${
                      r < minRating ? "fill-primary text-primary" : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
              {minRating > 0 && (
                <span className="text-xs text-muted-foreground ml-2">{minRating}+ stars</span>
              )}
            </div>
          </div>

          {/* Deliverable toggle */}
          {pincode && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Delivery</p>
              <Button
                size="sm"
                variant={deliverableOnly ? "default" : "outline"}
                onClick={() => setDeliverableOnly(!deliverableOnly)}
                className="h-8 text-xs gap-1.5"
              >
                <Truck className="h-3.5 w-3.5" />
                Deliverable to {pincode}
              </Button>
            </div>
          )}

          {/* Sort + Clear */}
          <div className="flex items-center gap-3">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SearchSortOption)}>
              <SelectTrigger className="w-44 h-8">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="rating">Top Rated</SelectItem>
                <SelectItem value="popularity">Most Popular</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                Clear all filters
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      <p className="text-sm text-muted-foreground mb-4">
        {isLoading ? (
          "Searching..."
        ) : (
          <>
            {products.length} product{products.length !== 1 ? "s" : ""} found
            {query && (
              <>
                {" "}
                for "<span className="font-medium text-foreground">{query}</span>"
              </>
            )}
          </>
        )}
      </p>

      <ProductGrid loading={isLoading}>{interspersed}</ProductGrid>

      {!isLoading && products.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="No products found"
          description="Try adjusting your search or filters to find what you're looking for."
          actionLabel="Clear Filters"
          onAction={() => {
            setQuery("");
            clearFilters();
          }}
        />
      )}
    </div>
  );
};

export default SearchPage;
