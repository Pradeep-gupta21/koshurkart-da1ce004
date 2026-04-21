import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedLocalSellerBadgeProps {
  className?: string;
  /** Use a smaller, denser variant when stacked alongside other badges. */
  compact?: boolean;
}

const VerifiedLocalSellerBadge = ({ className, compact }: VerifiedLocalSellerBadgeProps) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 text-success font-semibold tracking-wide",
      compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
      className,
    )}
    aria-label="Verified local seller from Jammu & Kashmir"
  >
    <ShieldCheck className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
    Verified Local Seller
  </span>
);

export default VerifiedLocalSellerBadge;
