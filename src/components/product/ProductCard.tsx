import { Link } from "react-router-dom";
import { Star, AlertTriangle, ShieldCheck } from "lucide-react";
import { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/contexts/CartContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ServiceabilityBadge from "@/components/location/ServiceabilityBadge";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const { addToCart } = useCart();
  const { formatPrice } = useCurrency();
  const availableStock = product.stock - (product.reservedStock ?? 0);
  const isOutOfStock = availableStock <= 0;
  const isLowStock = !isOutOfStock && availableStock <= (product.lowStockThreshold ?? 5);

  const { data: vendorData } = useQuery({
    queryKey: ['vendor-verified', product.vendorId],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select('is_verified')
        .eq('id', product.vendorId)
        .single();
      return data;
    },
    enabled: !!product.vendorId,
    staleTime: 60000,
  });
  const isVerified = vendorData?.is_verified ?? false;

  return (
    <div className="group relative bg-card rounded-xl marketplace-shadow transition-all duration-200 hover:-translate-y-0.5 hover:marketplace-shadow-hover overflow-hidden">
      {product.isSponsored && (
        <span className="absolute top-2 left-2 z-10 bg-background/90 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider text-muted-foreground border">
          SPONSORED
        </span>
      )}
      {isOutOfStock && (
        <span className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full text-[10px] font-bold">
          OUT OF STOCK
        </span>
      )}
      {!isOutOfStock && product.discountPrice && (
        <span className="absolute top-2 right-2 z-10 bg-accent text-accent-foreground px-2 py-0.5 rounded-full text-[10px] font-bold">
          {Math.round((1 - product.discountPrice / product.price) * 100)}% OFF
        </span>
      )}

      <Link to={`/product/${product.slug}`}>
        <div className={`aspect-square overflow-hidden bg-muted ${isOutOfStock ? 'opacity-50' : ''}`}>
          <img
            src={product.images[0]}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      </Link>

      <div className="p-4">
        <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
          {product.vendorName}
          {isVerified && <ShieldCheck className="h-3 w-3 text-primary" />}
        </p>
        <Link to={`/product/${product.slug}`}>
          <h3 className="text-sm font-medium text-card-foreground line-clamp-1 hover:text-primary transition-colors">
            {product.title}
          </h3>
        </Link>

        <div className="flex items-center gap-1 mt-1.5">
          <Star className="h-3 w-3 fill-accent text-accent" />
          <span className="text-xs font-medium tabular-nums">{product.rating}</span>
          <span className="text-xs text-muted-foreground">({product.reviewCount})</span>
        </div>

        {isLowStock && (
          <div className="flex items-center gap-1 mt-1.5">
            <AlertTriangle className="h-3 w-3 text-destructive/70" />
            <span className="text-[11px] font-medium text-destructive/70">Only {availableStock} left</span>
          </div>
        )}

        <div className="mt-1.5">
          <ServiceabilityBadge productId={product.id} />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-primary tabular-nums">
              {formatPrice(product.discountPrice ?? product.price)}
            </span>
            {product.discountPrice && (
              <span className="text-xs text-muted-foreground line-through tabular-nums">
                {formatPrice(product.price)}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={isOutOfStock}
            onClick={(e) => {
              e.preventDefault();
              addToCart(product);
            }}
          >
            {isOutOfStock ? "Sold Out" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
