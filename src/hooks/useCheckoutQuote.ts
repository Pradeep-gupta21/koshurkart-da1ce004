import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/hooks/useAuth";
import type { PricingDebug } from "@/components/checkout/PricingDebugBox";

export interface QuoteLine {
  product_id: string;
  title: string;
  image: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  in_stock: boolean;
  available: number;
  status: string;
}

export interface CheckoutQuote {
  quote_id: string;
  currency: "INR";
  lines: QuoteLine[];
  subtotal: number;
  expires_at: string;
  /** Present only when DEBUG_PRICING=true on the edge function. */
  debug?: PricingDebug;
}

/**
 * Fetches the server-priced quote for the current cart.
 * The returned `subtotal` is the EXACT amount the user will be charged at checkout.
 */
export function useCheckoutQuote() {
  const { items } = useCart();
  const { user } = useAuth();
  const itemsKey = items
    .map((i) => `${i.product.id}:${i.quantity}`)
    .sort()
    .join(",");

  return useQuery<CheckoutQuote>({
    queryKey: ["checkout-quote", user?.id ?? "guest", itemsKey],
    enabled: items.length > 0 && !!user,
    staleTime: 60_000,
    refetchInterval: 4 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const payload = items.map(({ product, quantity }) => ({
        product_id: product.id,
        quantity,
      }));
      const { data, error } = await supabase.functions.invoke("quote-checkout", {
        body: { items: payload },
      });
      if (error) throw new Error(error.message ?? "Quote failed");
      if (data?.error) throw new Error(data.error);
      return data as CheckoutQuote;
    },
  });
}
