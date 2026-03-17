import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Plus, Eye, MousePointer, TrendingUp, Target, DollarSign } from "lucide-react";

const VendorCampaigns = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", placement: "search", budget: "", dailyLimit: "", bidAmount: "0.10", startDate: "", endDate: "" });
  const { toast } = useToast();

  const fetchData = async () => {
    const [campRes, prodRes] = await Promise.all([
      supabase.from("ad_campaigns").select("*, products(title)").eq("vendor_id", vendorId).order("created_at", { ascending: false }),
      supabase.from("products").select("id, title").eq("vendor_id", vendorId),
    ]);
    setCampaigns(campRes.data ?? []);
    setProducts(prodRes.data ?? []);
  };

  useEffect(() => { if (vendorId) fetchData(); }, [vendorId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("ad_campaigns").insert({
      vendor_id: vendorId,
      product_id: form.productId,
      placement: form.placement,
      budget: parseFloat(form.budget),
      daily_limit: form.dailyLimit ? parseFloat(form.dailyLimit) : 0,
      bid_amount: parseFloat(form.bidAmount),
      start_date: form.startDate,
      end_date: form.endDate || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Campaign created", description: "Pending admin approval." });
    setOpen(false);
    setForm({ productId: "", placement: "search", budget: "", dailyLimit: "", bidAmount: "0.10", startDate: "", endDate: "" });
    fetchData();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-secondary text-secondary-foreground";
      case "pending": return "bg-accent text-accent-foreground";
      case "paused": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const totalImpressions = campaigns.reduce((s: number, c: any) => s + (c.impressions ?? 0), 0);
  const totalClicks = campaigns.reduce((s: number, c: any) => s + (c.clicks ?? 0), 0);
  const totalConversions = campaigns.reduce((s: number, c: any) => s + (c.conversions ?? 0), 0);
  const totalBudget = campaigns.reduce((s: number, c: any) => s + Number(c.budget ?? 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";
  const convRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : "0.00";

  // Sort by effective_score desc to show rank
  const sortedApproved = [...campaigns].filter(c => c.status === 'approved').sort((a, b) => (b.effective_score ?? 0) - (a.effective_score ?? 0));

  return (
    <div className="space-y-6">
      {/* Analytics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="marketplace-shadow">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Total Budget</p>
            <p className="text-2xl font-bold">${totalBudget.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="marketplace-shadow">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Impressions</p>
            <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="marketplace-shadow">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Clicks</p>
            <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="marketplace-shadow">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">CTR</p>
            <p className="text-2xl font-bold">{ctr}%</p>
          </CardContent>
        </Card>
        <Card className="marketplace-shadow">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Conversions</p>
            <p className="text-2xl font-bold">{totalConversions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="marketplace-shadow">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Conv. Rate</p>
            <p className="text-2xl font-bold">{convRate}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ad Campaigns</h1>
          <p className="text-muted-foreground">Boost your products with sponsored placements</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Campaign</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} required>
                  <option value="">Select a product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Placement</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.placement} onChange={e => setForm(f => ({ ...f, placement: e.target.value }))}>
                  <option value="homepage">Homepage</option>
                  <option value="search">Search Results</option>
                  <option value="product">Product Page</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Bid Amount ($)</Label>
                  <Input type="number" step="0.01" min="0.01" value={form.bidAmount} onChange={e => setForm(f => ({ ...f, bidAmount: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Budget ($)</Label>
                  <Input type="number" step="0.01" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Daily Limit ($)</Label>
                  <Input type="number" step="0.01" value={form.dailyLimit} onChange={e => setForm(f => ({ ...f, dailyLimit: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
              <Button type="submit" className="w-full">Submit Campaign</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {campaigns.length === 0 ? (
        <Card className="marketplace-shadow">
          <CardContent className="py-12 text-center">
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">No campaigns yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Create your first ad campaign to boost visibility.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(c => {
            const campCtr = (c.impressions ?? 0) > 0 ? (((c.clicks ?? 0) / (c.impressions ?? 1)) * 100).toFixed(2) : "0.00";
            const campConvRate = (c.clicks ?? 0) > 0 ? (((c.conversions ?? 0) / (c.clicks ?? 1)) * 100).toFixed(2) : "0.00";
            const rank = sortedApproved.findIndex(x => x.id === c.id);
            return (
              <Card key={c.id} className="marketplace-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{(c as any).products?.title ?? "Product"}</h3>
                    <div className="flex items-center gap-2">
                      {rank >= 0 && (
                        <Badge variant="outline" className="text-xs">
                          <TrendingUp className="h-3 w-3 mr-1" /> Rank #{rank + 1}
                        </Badge>
                      )}
                      <Badge className={statusColor(c.status)}>{c.status}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="capitalize">{c.placement}</span>
                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />Bid: ${Number(c.bid_amount ?? 0).toFixed(2)}</span>
                    <span>Budget: ${c.budget}</span>
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{c.impressions ?? 0}</span>
                    <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" />{c.clicks ?? 0}</span>
                    <span className="flex items-center gap-1"><Target className="h-3 w-3" />{c.conversions ?? 0} conv.</span>
                    <span>CTR: {campCtr}%</span>
                    <span>Conv: {campConvRate}%</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>Quality: {Number(c.quality_score ?? 0).toFixed(1)}</span>
                    <span>Effective: {Number(c.effective_score ?? 0).toFixed(3)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VendorCampaigns;
