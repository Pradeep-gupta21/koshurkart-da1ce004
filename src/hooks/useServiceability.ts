import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/contexts/LocationContext";
import { locationService } from "@/services/locationService";

export interface ServiceabilityRow {
  product_id: string;
  deliverable: boolean;
  eta_days: number | null;
  surcharge_pct: number;
  cod: boolean;
}

/**
 * Batched serviceability lookup for a list of product IDs.
 * Returns a map keyed by product_id for O(1) lookups in components.
 * Uses the active location pincode from LocationContext.
 */
export function useServiceability(productIds: string[]) {
  const { location } = useLocation();
  const pincode = location?.pincode ?? null;

  // Stable key — sorted ids
  const sortedIds = [...productIds].sort();
  const key = sortedIds.join(",");

  const { data = [], isLoading } = useQuery({
    queryKey: ["serviceability-batch", pincode, key],
    queryFn: () => locationService.checkServiceability(pincode!, sortedIds),
    enabled: !!pincode && sortedIds.length > 0,
    staleTime: 10 * 60_000,
  });

  const map = new Map<string, ServiceabilityRow>();
  for (const row of data) map.set(row.product_id, row);

  return { pincode, map, isLoading, rows: data };
}
