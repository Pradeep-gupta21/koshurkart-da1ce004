/**
 * useAdminPayments — React Query hook for admin payment data.
 *
 * Fix 9: Extracted from AdminPayments.tsx so that payment data fetching and
 * cache management live in the service/query layer rather than in the component.
 * Benefits:
 *   - Automatic cache invalidation via `refetch()` instead of manual state resets.
 *   - Shared cache across admin pages that need the same payment data.
 *   - Standardised error + loading states.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdminPayment = {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  payment_method: string;
  payment_provider: string | null;
  payment_status: string;
  transaction_id: string | null;
  payment_proof: string | null;
  upi_id: string | null;
  qr_code_url: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  webhook_confirmed_at?: string | null;
  created_at: string;
};

export const ADMIN_PAYMENTS_QUERY_KEY = ["admin-payments"] as const;

async function fetchAdminPayments(): Promise<AdminPayment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data as AdminPayment[]) ?? [];
}

/**
 * Hook for fetching all admin payments with caching and automatic retry.
 *
 * @example
 * const { data, isLoading, error, refetch } = useAdminPayments();
 */
export function useAdminPayments() {
  return useQuery({
    queryKey: ADMIN_PAYMENTS_QUERY_KEY,
    queryFn: fetchAdminPayments,
    // Cache for 30 seconds before treating data as stale.
    staleTime: 30_000,
    // Retry 3 times on network/server errors before surfacing to the UI.
    retry: 3,
  });
}
