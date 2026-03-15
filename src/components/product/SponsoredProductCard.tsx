import { Link } from "react-router-dom";
import { useEffect } from "react";
import { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import RatingStars from "./RatingStars";
import PriceDisplay from "./PriceDisplay";
import { Sparkles } from "lucide-react";
import { adService } from "@/services/adService";

interface SponsoredProductCardProps {
  product: Product;
  campaignId?: string;
}

const SponsoredProductCard = ({ product, campaignId }: SponsoredProductCardProps) => {
  const { addToCart } = useCart();

  useEffect(() => {
    if (campaignId) {
      adService.trackImpression(campaignId);
    }
  }, [campaignId]);

  const handleClick = () => {
    if (campaignId) {
      adService.trackClick(campaignId);
    }
  };

  return (
    <div className="group relative bg-card rounded-xl marketplace-shadow overflow-hidden ring-1 ring-accent/20 transition-all duration-200 hover:-translate-y-0.5 hover:marketplace-shadow-hover">
      <span className="absolute top-2 left-2 z-10 bg-accent text-accent-foreground px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
        <Sparkles className="h-3 w-3" /> SPONSORED
      </span>
      {product.discountPrice && (
        <span className="absolute top-2 right-2 z-10 bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full text-[10px] font-bold">
          {Math.round((1 - product.discountPrice / product.price) * 100)}% OFF
        </span>
      )}

      <Link to={`/product/${product.slug}`} onClick={handleClick}>
        <div className="aspect-square overflow-hidden bg-muted">
          <img
            src={product.images[0]}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      </Link>

      <div className="p-4">
        <p className="text-[11px] text-muted-foreground mb-1">{product.vendorName}</p>
        <Link to={`/product/${product.slug}`} onClick={handleClick}>
          <h3 className="text-sm font-medium text-card-foreground line-clamp-1 hover:text-primary transition-colors">
            {product.title}
          </h3>
        </Link>

        <RatingStars rating={product.rating} showValue reviewCount={product.reviewCount} className="mt-1.5" />

        <div className="mt-2 flex items-center justify-between">
          <PriceDisplay price={product.price} discountPrice={product.discountPrice} size="sm" />
          <Button
            size="sm"
            variant="default"
            className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.preventDefault(); addToCart(product); }}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SponsoredProductCard;
