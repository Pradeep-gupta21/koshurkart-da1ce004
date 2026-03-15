import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductCard from "@/components/product/ProductCard";
import ProductGrid from "@/components/product/ProductGrid";
import { productService, type SortOption } from "@/services/productService";

const defaultCategories = ["Electronics", "Fashion", "Home & Living", "Sports", "Beauty", "Books"];

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialCategory = searchParams.get("category") || "All";

  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [showFilters, setShowFilters] = useState(false);

  const { data: dbCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productService.getCategories(),
  });

  const categories = ["All", ...(dbCategories.length > 0 ? dbCategories : defaultCategories)];

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', 'search', query, selectedCategory, sortBy],
    queryFn: () => productService.getAll({
      search: query || undefined,
      category: selectedCategory !== "All" ? selectedCategory : undefined,
      sort: sortBy === "relevance" ? "newest" : sortBy,
    }),
  });

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
        <Button variant="outline" className="h-11 gap-2" onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-6 p-4 bg-muted/50 rounded-xl">
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
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
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-40 h-8">
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
        </div>
      )}

      {/* Results */}
      <p className="text-sm text-muted-foreground mb-4">
        {isLoading ? "Searching..." : (
          <>
            {products.length} product{products.length !== 1 ? "s" : ""} found
            {query && <> for "<span className="font-medium text-foreground">{query}</span>"</>}
          </>
        )}
      </p>

      <ProductGrid loading={isLoading}>
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ProductGrid>

      {!isLoading && products.length === 0 && (
        <div className="text-center py-20">
          <p className="text-lg font-medium">No products found</p>
          <p className="text-muted-foreground text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
