import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Store } from "lucide-react";

interface VendorRow {
  id: string;
  store_name: string;
  store_slug: string;
  description: string | null;
  verification_status: string;
  created_at: string;
  user_id: string;
}

const AdminVendors = () => {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchVendors = async () => {
    const { data } = await supabase
      .from("vendors")
      .select("*")
      .order("created_at", { ascending: false });
    setVendors((data as VendorRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchVendors(); }, []);

  const updateStatus = async (vendorId: string, status: string) => {
    setActionLoading(vendorId);
    const { error } = await supabase
      .from("vendors")
      .update({ verification_status: status })
      .eq("id", vendorId);

    setActionLoading(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Vendor ${status}` });
    fetchVendors();
  };

  const statusColor = (s: string) => {
    if (s === "verified") return "default";
    if (s === "rejected") return "destructive";
    return "secondary";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Vendor Management</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : vendors.length === 0 ? (
        <p className="text-muted-foreground">No vendors found.</p>
      ) : (
        <div className="space-y-3">
          {vendors.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Store className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{v.store_name}</p>
                    <p className="text-xs text-muted-foreground">{v.description || "No description"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={statusColor(v.verification_status)}>
                    {v.verification_status}
                  </Badge>
                  {v.verification_status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateStatus(v.id, "verified")}
                        disabled={actionLoading === v.id}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => updateStatus(v.id, "rejected")}
                        disabled={actionLoading === v.id}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminVendors;
