import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingStarsProps {
  rating: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  reviewCount?: number;
  className?: string;
}

const sizeMap = { sm: "h-3 w-3", md: "h-4 w-4", lg: "h-5 w-5" };
const textMap = { sm: "text-xs", md: "text-sm", lg: "text-base" };

const RatingStars = ({ rating, max = 5, size = "sm", showValue = false, reviewCount, className }: RatingStarsProps) => {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex">
        {Array.from({ length: max }, (_, i) => (
          <Star
            key={i}
            className={cn(
              sizeMap[size],
              i < Math.round(rating) ? "fill-accent text-accent" : "text-muted"
            )}
          />
        ))}
      </div>
      {showValue && <span className={cn("font-medium tabular-nums", textMap[size])}>{rating}</span>}
      {reviewCount !== undefined && (
        <span className={cn("text-muted-foreground", textMap[size])}>({reviewCount})</span>
      )}
    </div>
  );
};

export default RatingStars;
