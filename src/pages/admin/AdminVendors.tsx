import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Store, Pause, Play } from "lucide-react";

interface VendorRow {
  id: string;
  store_name: string;
  store_slug: string;
  description: string | null;
  verification_status: string;
  created_at: string;
  user_id: string;
}

type FilterTab = "all" | "pending" | "verified" | "suspended" | "rejected";

const AdminVendors = () => {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
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
    if (s === "suspended") return "destructive";
    return "secondary";
  };

  const filtered = filter === "all" ? vendors : vendors.filter((v) => v.verification_status === filter);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "verified", label: "Verified" },
    { key: "suspended", label: "Suspended" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Vendor Management</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={filter === t.key ? "default" : "outline"}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
            {t.key !== "all" && (
              <span className="ml-1 text-xs">({vendors.filter((v) => v.verification_status === t.key).length})</span>
            )}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No vendors found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
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
                      <Button size="sm" onClick={() => updateStatus(v.id, "verified")} disabled={actionLoading === v.id}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => updateStatus(v.id, "rejected")} disabled={actionLoading === v.id}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                  {v.verification_status === "verified" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(v.id, "suspended")} disabled={actionLoading === v.id}>
                      <Pause className="h-4 w-4 mr-1" /> Suspend
                    </Button>
                  )}
                  {v.verification_status === "suspended" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(v.id, "verified")} disabled={actionLoading === v.id}>
                      <Play className="h-4 w-4 mr-1" /> Reinstate
                    </Button>
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
