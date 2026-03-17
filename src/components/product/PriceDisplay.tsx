import { cn } from "@/lib/utils";

interface PriceDisplayProps {
  price: number;
  discountPrice?: number | null;
  dynamicPrice?: number | null;
  basePrice?: number | null;
  size?: "sm" | "md" | "lg";
  showSavings?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { main: "text-lg", original: "text-xs", savings: "text-[10px]" },
  md: { main: "text-xl", original: "text-sm", savings: "text-xs" },
  lg: { main: "text-3xl", original: "text-lg", savings: "text-sm" },
};

const PriceDisplay = ({ price, discountPrice, size = "md", showSavings = false, className }: PriceDisplayProps) => {
  const styles = sizeMap[size];
  const displayPrice = discountPrice ?? price;
  const savingsPercent = discountPrice ? Math.round((1 - discountPrice / price) * 100) : 0;

  return (
    <div className={cn("flex items-baseline gap-1.5 flex-wrap", className)}>
      <span className={cn("font-semibold text-primary tabular-nums", styles.main)}>
        ${displayPrice.toFixed(2)}
      </span>
      {discountPrice && (
        <>
          <span className={cn("text-muted-foreground line-through tabular-nums", styles.original)}>
            ${price.toFixed(2)}
          </span>
          {showSavings && savingsPercent > 0 && (
            <span className={cn("font-semibold text-secondary", styles.savings)}>
              Save {savingsPercent}%
            </span>
          )}
        </>
      )}
    </div>
  );
};

export default PriceDisplay;
