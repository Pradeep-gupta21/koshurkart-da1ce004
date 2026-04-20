import { useQuery } from "@tanstack/react-query";
import { Truck, AlertCircle, Clock } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { locationService } from "@/services/locationService";
import { cn } from "@/lib/utils";

interface Props {
  productId: string;
  className?: string;
  variant?: "compact" | "full";
}

function formatEta(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const ServiceabilityBadge = ({ productId, className, variant = "compact" }: Props) => {
  const { location } = useLocation();
  const pincode = location?.pincode;

  const { data, isLoading } = useQuery({
    queryKey: ["serviceability", pincode, productId],
    queryFn: () => locationService.checkServiceability(pincode!, [productId]),
    enabled: !!pincode && !!productId,
    staleTime: 5 * 60_000,
  });

  if (!pincode) return null;
  if (isLoading) {
    return <span className={cn("text-[11px] text-muted-foreground", className)}>Checking…</span>;
  }
  const row = data?.[0];
  if (!row || !row.deliverable) {
    return (
      <div className={cn("flex items-center gap-1 text-[11px] font-medium text-destructive", className)}>
        <AlertCircle className="h-3 w-3" />
        <span>Not deliverable to {pincode}</span>
      </div>
    );
  }
  const eta = row.eta_days ?? 0;
  const isFast = eta <= 4;
  const Icon = isFast ? Truck : Clock;
  return (
    <div className={cn("flex items-center gap-1 text-[11px] font-medium",
      isFast ? "text-primary" : "text-amber-600 dark:text-amber-400", className)}>
      <Icon className="h-3 w-3" />
      <span>
        {variant === "full" ? `Delivery by ${formatEta(eta)}` : `By ${formatEta(eta)}`}
        {row.surcharge_pct > 0 && ` · +${row.surcharge_pct}% shipping`}
      </span>
    </div>
  );
};

export default ServiceabilityBadge;
