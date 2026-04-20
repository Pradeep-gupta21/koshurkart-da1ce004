import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { locationService } from "@/services/locationService";
import { mapDbProduct } from "@/services/productService";
import ProductCard from "@/components/product/ProductCard";
import ProductGrid from "@/components/product/ProductGrid";

const LocalDeals = () => {
  const { location } = useLocation();
  const pincode = location?.pincode ?? null;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["local-deals", pincode],
    queryFn: () => locationService.getLocalDeals(pincode, 8),
    staleTime: 5 * 60_000,
  });

  if (!isLoading && rows.length === 0) return null;

  const products = rows.map((row: any) =>
    mapDbProduct({ ...row, vendors: { store_name: row.store_name } }),
  );

  const heading = location?.city
    ? `Today's Kashmiri Deals · ${location.city}`
    : "Today's Kashmiri Deals";

  // Use horizontal scroll when ≥4 items; otherwise fall back to grid
  const useScroller = products.length >= 4;

  return (
    <section className="container mx-auto px-4 mt-12">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <div>
            <h2 className="text-xl font-serif font-semibold tracking-tight">{heading}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pincode
                ? `Discounted picks delivering to ${pincode}`
                : "Saffron-priced picks from the valley"}
            </p>
          </div>
        </div>
      </div>
      {useScroller ? (
        <div className="-mx-4 px-4 overflow-x-auto snap-x snap-mandatory scroll-smooth">
          <div className="flex gap-4 pb-2">
            {products.map((p) => (
              <div key={p.id} className="snap-start shrink-0 w-[220px] sm:w-[240px] md:w-[260px]">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ProductGrid loading={isLoading} skeletonCount={8}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </ProductGrid>
      )}
    </section>
  );
};

export default LocalDeals;
