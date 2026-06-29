import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, XCircle, Store, Pause, Play, ShieldCheck, ShieldOff,
  FileSearch, Search, Sparkles,
} from "lucide-react";
import KYCReviewSheet from "@/components/vendor/KYCReviewSheet";

interface VendorRow {
  id: string;
  store_name: string;
  store_slug: string;
  description: string | null;
  verification_status: string;
  created_at: string;
  user_id: string;
  trust_score: number | null;
  is_verified: boolean | null;
  kyc_status: string | null;
  is_commission_exempt: boolean | null;
  owner_name: string | null;
  owner_email: string | null;
}

type FilterTab = "all" | "pending" | "verified" | "suspended" | "rejected" | "kyc";

const AdminVendors = () => {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [reviewVendorId, setReviewVendorId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchVendors = async () => {
    const { data, error } = await supabase.rpc("search_vendors_admin", {
      _search: null,
      _limit: 500,
    });
    if (error) {
      toast({ title: "Failed to load vendors", description: error.message, variant: "destructive" });
    }
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

  const toggleVerified = async (vendorId: string, current: boolean) => {
    setActionLoading(vendorId);
    const { error } = await supabase
      .from("vendors")
      .update({ is_verified: !current })
      .eq("id", vendorId);

    setActionLoading(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: !current ? "Vendor verified" : "Verification removed" });
    fetchVendors();
  };

  const toggleCommissionExempt = async (vendorId: string, next: boolean) => {
    // Optimistic update
    setVendors((prev) => prev.map((v) => v.id === vendorId ? { ...v, is_commission_exempt: next } : v));
    const { error } = await supabase
      .from("vendors")
      .update({ is_commission_exempt: next })
      .eq("id", vendorId);
    if (error) {
      // Revert
      setVendors((prev) => prev.map((v) => v.id === vendorId ? { ...v, is_commission_exempt: !next } : v));
      toast({ title: "Failed to update commission flag", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? "Commission waived" : "Commission re-enabled",
      description: next
        ? "All marketplace fees are now waived for this vendor."
        : "Standard platform commission applies to this vendor.",
    });
  };

  const statusColor = (s: string) => {
    if (s === "verified") return "default";
    if (s === "rejected") return "destructive";
    if (s === "suspended") return "destructive";
    return "secondary";
  };

  const trustScoreColor = (score: number) => {
    if (score >= 80) return "text-success bg-success/10";
    if (score >= 60) return "text-accent bg-accent/10";
    return "text-destructive bg-destructive/10";
  };

  const filtered = useMemo(() => {
    const byTab =
      filter === "all"
        ? vendors
        : filter === "kyc"
        ? vendors.filter((v) => v.kyc_status === "pending")
        : vendors.filter((v) => v.verification_status === filter);

    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((v) =>
      v.store_name?.toLowerCase().includes(q) ||
      v.store_slug?.toLowerCase().includes(q) ||
      (v.owner_name ?? "").toLowerCase().includes(q) ||
      (v.owner_email ?? "").toLowerCase().includes(q),
    );
  }, [vendors, filter, search]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "kyc", label: "KYC Review" },
    { key: "verified", label: "Verified" },
    { key: "suspended", label: "Suspended" },
    { key: "rejected", label: "Rejected" },
  ];

  const tabCount = (key: FilterTab) =>
    key === "kyc"
      ? vendors.filter((v) => v.kyc_status === "pending").length
      : vendors.filter((v) => v.verification_status === key).length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-4">Vendor Management</h1>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors by name, email, or store name..."
          className="pl-9"
          aria-label="Search vendors"
        />
      </div>

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
              <span className="ml-1 text-xs">({tabCount(t.key)})</span>
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
        <p className="text-muted-foreground">No vendors match your search.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <Card key={v.id}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Store className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground flex items-center gap-1.5">
                        {v.store_name}
                        {v.is_verified && <ShieldCheck className="h-4 w-4 text-primary" />}
                        {v.is_commission_exempt && (
                          <Badge variant="outline" className="ml-1 gap-1 border-accent/40 text-accent">
                            <Sparkles className="h-3 w-3" /> Influencer
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {v.owner_name || "—"} · {v.owner_email || "no email"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${trustScoreColor(v.trust_score ?? 0)}`}>
                      Trust: {Math.round(v.trust_score ?? 0)}
                    </span>

                    <Badge variant={statusColor(v.verification_status)}>
                      {v.verification_status}
                    </Badge>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReviewVendorId(v.id)}
                    >
                      <FileSearch className="h-4 w-4 mr-1" /> View Core KYC Details
                    </Button>

                    <Button
                      size="sm"
                      variant={v.is_verified ? "outline" : "secondary"}
                      onClick={() => toggleVerified(v.id, v.is_verified ?? false)}
                      disabled={actionLoading === v.id}
                    >
                      {v.is_verified ? (
                        <><ShieldOff className="h-4 w-4 mr-1" /> Unverify</>
                      ) : (
                        <><ShieldCheck className="h-4 w-4 mr-1" /> Verify</>
                      )}
                    </Button>

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
                </div>

                {/* Influencer / commission-exempt toggle */}
                <div className="flex items-start justify-between gap-4 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <label
                      htmlFor={`exempt-${v.id}`}
                      className="text-sm font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-accent" />
                      Exempt from Platform Commission (Influencer Partnership)
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Waives all marketplace fees for this specific vendor.
                    </p>
                  </div>
                  <Switch
                    id={`exempt-${v.id}`}
                    checked={!!v.is_commission_exempt}
                    onCheckedChange={(next) => toggleCommissionExempt(v.id, next)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <KYCReviewSheet
        vendorId={reviewVendorId}
        open={!!reviewVendorId}
        onOpenChange={(o) => { if (!o) setReviewVendorId(null); }}
        onChanged={fetchVendors}
      />
    </div>
  );
};

export default AdminVendors;
