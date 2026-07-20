import { Heart } from "lucide-react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWishlist } from "@/contexts/WishlistContext";
import { useAuth } from "@/hooks/useAuth";
import { ServiceFactory } from "@/services/commerce/di/ServiceFactory";
import { analyticsService } from "@/services/analyticsService";
import ProductCard from "@/components/product/ProductCard";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonLoader from "@/components/ui/SkeletonLoader";
import { Link } from "react-router-dom";

const WishlistPage = () => {
  const { ids, loading } = useWishlist();
  const { user } = useAuth();
  const idList = Array.from(ids);

  useEffect(() => {
    (analyticsService.trackEvent as any)("wishlist_view", undefined, undefined, {
      count: idList.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["wishlist-products", idList.sort().join(",")],
    queryFn: async () => {
      if (idList.length === 0) return [];
      const result = await ServiceFactory.getProductService().getProductsByIds(idList);
      if (!result.success) throw new Error((result as any).error?.message || "Error");
      return result.data;
    },
    enabled: idList.length > 0,
  });

  const showLoading = loading || (idList.length > 0 && isLoading);

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Heart className="h-6 w-6 text-destructive fill-destructive" />
        <h1 className="text-2xl md:text-3xl font-serif font-semibold tracking-tight">
          Your Wishlist
        </h1>
        {products.length > 0 && (
          <span className="text-sm text-muted-foreground">({products.length})</span>
        )}
      </div>

      {showLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <SkeletonLoader variant="product-card" count={8} className="contents" />
        </div>
      ) : products.length === 0 ? (
        <>
          <EmptyState
            icon={Heart}
            title="Your Wishlist is Empty"
            description="Save products you love and revisit them anytime."
            actionLabel="Explore Products"
            actionHref="/"
          />
          {!user && (
            <p className="text-center text-sm text-muted-foreground -mt-8">
              <Link to="/auth" className="text-primary hover:underline">
                Sign in
              </Link>{" "}
              to sync your wishlist across devices.
            </p>
          )}
        </>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
