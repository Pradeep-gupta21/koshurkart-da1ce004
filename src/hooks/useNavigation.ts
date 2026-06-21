import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  shopperNav, adminNav, vendorNav, filterSections,
  type NavRole, type NavSection,
} from "@/config/navigation";

export type BadgeMap = Partial<Record<
  "pendingVendors" | "suspiciousReviews" | "pendingPayments" | "newOrders" | "unreadNotifications" | "pendingReturns",
  number
>>;

export function useNavigationRoles(): NavRole[] {
  const { user, roles } = useAuth();
  return useMemo<NavRole[]>(() => {
    if (!user) return ["guest"];
    const r: NavRole[] = ["user"];
    if (roles.includes("vendor")) r.push("vendor");
    if (roles.includes("admin")) r.push("admin");
    return r;
  }, [user, roles]);
}

/** Auth loading flag — sidebars use this to show a skeleton instead of guest items. */
export function useAuthLoading(): boolean {
  return useAuth().loading;
}

export function useShopperNavigation(): NavSection[] {
  const roles = useNavigationRoles();
  return useMemo(() => filterSections(shopperNav, roles), [roles]);
}

export function useAdminNavigation(): NavSection[] {
  const roles = useNavigationRoles();
  return useMemo(() => filterSections(adminNav, roles), [roles]);
}

export function useVendorNavigation(): NavSection[] {
  const roles = useNavigationRoles();
  return useMemo(() => filterSections(vendorNav, roles), [roles]);
}

/* ----------------------------- BADGE COUNTS ----------------------------- */

export function useAdminBadges(): BadgeMap {
  const { isAdmin } = useAuth();
  const { data } = useQuery({
    queryKey: ["nav-badges", "admin"],
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<BadgeMap> => {
      const [vendors, reviews, payments] = await Promise.all([
        supabase.from("vendors").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
        supabase.rpc("count_suspicious_reviews"),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("payment_status", "pending_verification"),
      ]);
      return {
        pendingVendors: vendors.count ?? 0,
        suspiciousReviews: Number(reviews.data ?? 0),
        pendingPayments: payments.count ?? 0,
      };
    },
  });
  return data ?? {};
}

export function useVendorBadges(): BadgeMap {
  const { user, vendorId } = useAuth();
  const { data } = useQuery({
    queryKey: ["nav-badges", "vendor", vendorId],
    enabled: !!vendorId && !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<BadgeMap> => {
      const [orders, notifications, returns] = await Promise.all([
        supabase.from("order_items").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId!),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("is_read", false),
        supabase.from("order_items").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId!).eq("return_status", "requested"),
      ]);
      return {
        newOrders: orders.count ?? 0,
        unreadNotifications: notifications.count ?? 0,
        pendingReturns: returns.count ?? 0,
      };
    },
  });
  return data ?? {};
}
