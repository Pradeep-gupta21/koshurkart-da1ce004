import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Eye, MousePointer, CheckCircle, XCircle, TrendingUp, Target, IndianRupee } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

const AdminCampaigns = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("pending");
  const { formatPrice } = useCurrency();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_campaigns")
        .select("*, products(title, images), vendors(store_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("ad_campaigns").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      toast({ title: "Campaign updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filtered = tab === "all" ? campaigns : campaigns.filter((c: any) => c.status === tab);

  // Sort approved by effective_score for ranking
  const approvedSorted = [...campaigns].filter((c: any) => c.status === 'approved').sort((a: any, b: any) => (b.effective_score ?? 0) - (a.effective_score ?? 0));

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-secondary text-secondary-foreground";
      case "pending": return "bg-accent text-accent-foreground";
      case "rejected": return "bg-destructive text-destructive-foreground";
      case "paused": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaign Management</h1>
        <p className="text-muted-foreground">Review and approve vendor ad campaigns</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({campaigns.filter((c: any) => c.status === "pending").length})</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="paused">Paused</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading campaigns...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns in this category.</p>
          ) : (
            filtered.map((c: any) => {
              const rank = approvedSorted.findIndex((x: any) => x.id === c.id);
              return (
                <Card key={c.id} className="marketplace-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{c.products?.title ?? "Unknown Product"}</h3>
                          {rank >= 0 && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              <TrendingUp className="h-3 w-3 mr-1" /> #{rank + 1}
                            </Badge>
                          )}
                          <Badge className={statusColor(c.status)}>{c.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Vendor: <span className="font-medium text-foreground">{c.vendors?.store_name ?? "—"}</span>
                          {" · "}Placement: <span className="capitalize">{c.placement}</span>
                          {" · "}Budget: <span className="font-medium">{formatPrice(Number(c.budget ?? 0))}</span>
                          {c.daily_limit > 0 && <> · Daily: {formatPrice(Number(c.daily_limit))}</>}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span>{c.start_date} → {c.end_date || "Ongoing"}</span>
                          <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />Bid: {formatPrice(Number(c.bid_amount ?? 0))}</span>
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{c.impressions ?? 0}</span>
                          <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" />{c.clicks ?? 0}</span>
                          <span className="flex items-center gap-1"><Target className="h-3 w-3" />{c.conversions ?? 0} conv.</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span>Quality: {Number(c.quality_score ?? 0).toFixed(1)}</span>
                          <span>Effective: {Number(c.effective_score ?? 0).toFixed(3)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {c.status === "pending" && (
                          <>
                            <Button size="sm" onClick={() => updateStatus.mutate({ id: c.id, status: "approved" })}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ id: c.id, status: "rejected" })}>
                              <XCircle className="h-4 w-4 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {c.status === "approved" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: c.id, status: "paused" })}>
                            Pause
                          </Button>
                        )}
                        {c.status === "paused" && (
                          <Button size="sm" onClick={() => updateStatus.mutate({ id: c.id, status: "approved" })}>
                            Resume
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCampaigns;
