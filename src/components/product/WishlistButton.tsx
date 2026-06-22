import { Heart } from "lucide-react";
import { useWishlist } from "@/contexts/WishlistContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WishlistButtonProps {
  productId: string;
  vendorId?: string;
  category?: string;
  variant?: "overlay" | "inline";
  className?: string;
}

const WishlistButton = ({
  productId,
  vendorId,
  category,
  variant = "overlay",
  className,
}: WishlistButtonProps) => {
  const { isWishlisted, toggle } = useWishlist();
  const active = isWishlisted(productId);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wasActive = active;
    await toggle(productId, { vendorId, category });
    toast.success(wasActive ? "Removed from wishlist" : "Saved to wishlist");
  };

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={active}
        className={cn(
          "inline-flex items-center justify-center gap-2 h-12 px-4 rounded-md border transition-colors min-w-[44px]",
          active
            ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
            : "border-input bg-background hover:bg-accent/10 hover:text-accent",
          className
        )}
      >
        <Heart className={cn("h-5 w-5 transition-transform motion-safe:duration-150", active && "fill-current scale-110")} />
        <span className="text-sm font-medium hidden sm:inline">
          {active ? "Wishlisted" : "Wishlist"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={active}
      className={cn(
        "absolute top-2 right-2 z-20 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-background/90 backdrop-blur",
        "flex items-center justify-center shadow-sm border border-border/60",
        "hover:bg-background hover:scale-105 transition-all motion-reduce:transform-none",
        "min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0",
        className
      )}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          active ? "fill-destructive text-destructive" : "text-muted-foreground"
        )}
        strokeWidth={2}
      />
    </button>
  );
};

export default WishlistButton;
