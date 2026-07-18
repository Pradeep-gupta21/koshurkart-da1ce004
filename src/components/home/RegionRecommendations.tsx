import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { ServiceFactory } from "@/services/commerce/di/ServiceFactory";
import { useServiceability } from "@/hooks/useServiceability";
import ProductCard from "@/components/product/ProductCard";
import ProductGrid from "@/components/product/ProductGrid";

/**
 * Region-aware recommendations strip.
 * - When pincode is set: filters ranked products to deliverable items only.
 * - When no pincode: falls back to global ranked products with generic heading.
 * - Hides entire section if no items remain after filtering.
 */
const RegionRecommendations = () => {
  const { location, userState } = useLocation();
  const pincode = location?.pincode ?? null;

  const { data: ranked = [], isLoading } = useQuery({
    queryKey: ["products", "region-ranked", 12, userState ?? ""],
    queryFn: async () => {
      const result = await ServiceFactory.getProductService().getRanked({ limit: 12, userState });
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    staleTime: 5 * 60_000,
  });

  const ids = ranked.map((p) => p.id);
  const { map: serviceMap, isLoading: loadingService } = useServiceability(ids);

  // If we have a pincode, filter to deliverable products. Otherwise show all.
  const filtered = pincode
    ? ranked.filter((p) => serviceMap.get(p.id)?.deliverable)
    : ranked;

  const products = filtered.slice(0, 8);

  // Skeleton while either query is loading
  if (isLoading || (pincode && loadingService)) {
    return (
      <section className="container mx-auto px-4 mt-12">
        <div className="mb-6">
          <div className="h-6 w-64 rounded-md shimmer" />
          <div className="h-4 w-48 rounded-md shimmer mt-2" />
        </div>
        <ProductGrid loading skeletonCount={8}>{null}</ProductGrid>
      </section>
    );
  }

  // Hide section entirely when no serviceable items
  if (products.length === 0) return null;

  const heading = location?.city
    ? `Recommended for ${location.city}`
    : "Recommended for you";

  const subheading = pincode
    ? `Top picks delivering to ${pincode}`
    : "Trending picks across the marketplace";

  return (
    <section className="container mx-auto px-4 mt-14">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-xl font-serif font-semibold tracking-tight">{heading}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{subheading}</p>
          </div>
        </div>
      </div>
      <ProductGrid>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </ProductGrid>
    </section>
  );
};

export default RegionRecommendations;
