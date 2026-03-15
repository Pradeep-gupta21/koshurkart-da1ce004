import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useVendor = () => {
  const { vendorId, isVendor } = useAuth();
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchVendor = useCallback(async () => {
    if (!vendorId) { setLoading(false); return; }
    const { data } = await supabase.from("vendors").select("*").eq("id", vendorId).single();
    setVendor(data);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => { fetchVendor(); }, [fetchVendor]);

  return { vendor, loading, isVendor, vendorId, refetch: fetchVendor };
};
