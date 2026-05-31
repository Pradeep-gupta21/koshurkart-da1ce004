import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useVendor = () => {
  const { vendorId, isVendor } = useAuth();
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchVendor = useCallback(async () => {
    if (!vendorId) { setLoading(false); return; }
    // Owner full row via SECURITY DEFINER RPC.
    const { data } = await supabase.rpc('get_my_vendor');
    setVendor(data?.[0] ?? null);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => { fetchVendor(); }, [fetchVendor]);

  return { vendor, loading, isVendor, vendorId, refetch: fetchVendor };
};
