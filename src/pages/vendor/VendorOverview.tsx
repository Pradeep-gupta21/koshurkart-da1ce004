import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Package, ShoppingCart, TrendingUp, AlertTriangle, ShieldCheck, Lightbulb, BarChart3, Wallet, Info } from "lucide-react";
import { vendorService } from "@/services/vendorService";
import { pricingService, PricingSuggestion } from "@/services/pricingService";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useToast } from "@/hooks/use-toast";

const scoreColor = (score: number) => {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-accent";
  return "text-destructive";
};

const VendorOverview = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const { toast } = useToast();
  const [stats, setStats] = useState({ products: 0, totalSales: 0, totalEarnings: 0, withdrawableBalance: 0, campaigns: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [pricingSuggestions, setPricingSuggestions] = useState<PricingSuggestion[]>([]);
  const [trustMetrics, setTrustMetrics] = useState<{
    trustScore: number; deliveryRate: number; cancellationRate: number;
    returnRate: number; reviewRating: number; isVerified: boolean;
  } | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    const fetchStats = async () => {
      const [prodRes, campaignRes, vendorRes] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
        supabase.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
        supabase.from("vendors").select("total_sales, total_earnings, withdrawable_balance").eq("id", vendorId).single(),
      ]);
      setStats({
        products: prodRes.count ?? 0,
        totalSales: vendorRes.data?.total_sales ?? 0,
        totalEarnings: Number(vendorRes.data?.total_earnings ?? 0),
        withdrawableBalance: Number(vendorRes.data?.withdrawable_balance ?? 0),
        campaigns: campaignRes.count ?? 0,
      });

      const { data: orderItems } = await supabase
        .from("order_items")
        .select("*, order_id")
        .eq("vendor_id", vendorId)
        .order("id", { ascending: false })
        .limit(5);
      setRecentOrders(orderItems ?? []);

      const { data: products } = await supabase
        .from("products")
        .select("id, title, stock, reserved_stock, low_stock_threshold")
        .eq("vendor_id", vendorId)
        .eq("status", "active");

      const lowStock = (products ?? []).filter(
        (p: any) => (p.stock - (p.reserved_stock ?? 0)) <= (p.low_stock_threshold ?? 5)
      );
      setLowStockProducts(lowStock);
    };

    const fetchTrust = async () => {
      try {
        const metrics = await vendorService.getTrustMetrics(vendorId);
        setTrustMetrics(metrics);
      } catch {}
    };

    fetchStats();
    fetchTrust();
    pricingService.getPricingSuggestions(vendorId).then(setPricingSuggestions).catch(() => {});
  }, [vendorId]);

  const handleNewOrder = useCallback(() => {
    // Re-fetch stats and recent orders when a new order item arrives
    toast({ title: "🛒 New order received!", description: "Your dashboard has been updated." });
    // Trigger re-fetch by re-running the effect
    if (!vendorId) return;
    const refresh = async () => {
      const [prodRes, campaignRes, vendorRes] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
        supabase.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
        supabase.from("vendors").select("total_sales, total_earnings, withdrawable_balance").eq("id", vendorId).single(),
      ]);
      setStats({
        products: prodRes.count ?? 0,
        totalSales: vendorRes.data?.total_sales ?? 0,
        totalEarnings: Number(vendorRes.data?.total_earnings ?? 0),
        withdrawableBalance: Number(vendorRes.data?.withdrawable_balance ?? 0),
        campaigns: campaignRes.count ?? 0,
      });
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("*, order_id")
        .eq("vendor_id", vendorId)
        .order("id", { ascending: false })
        .limit(5);
      setRecentOrders(orderItems ?? []);
    };
    refresh();
  }, [vendorId, toast]);

  useRealtimeSubscription({
    table: "order_items",
    event: "INSERT",
    filter: `vendor_id=eq.${vendorId}`,
    onPayload: handleNewOrder,
    enabled: !!vendorId,
  });

  const cards = [
    { title: "Total Products", value: stats.products, icon: Package, color: "text-primary" },
    { title: "Total Sales", value: stats.totalSales, icon: ShoppingCart, color: "text-secondary" },
    { title: "Earnings", value: `$${stats.earnings.toFixed(2)}`, icon: DollarSign, color: "text-accent" },
    { title: "Active Campaigns", value: stats.campaigns, icon: TrendingUp, color: "text-primary" },
  ];

  const suggestions = trustMetrics ? [
    trustMetrics.deliveryRate < 90 && "Improve your delivery rate by fulfilling orders promptly.",
    trustMetrics.cancellationRate > 5 && "Reduce cancellations to boost your trust score.",
    trustMetrics.returnRate > 5 && "Lower return rates by improving product quality descriptions.",
    trustMetrics.reviewRating < 4 && "Focus on customer satisfaction to improve your review rating.",
  ].filter(Boolean) as string[] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Overview</h1>
        <p className="text-muted-foreground">Welcome to your vendor dashboard</p>
      </div>

      {/* Trust Score Card */}
      {trustMetrics && (
        <Card className="marketplace-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              Trust Score
              {trustMetrics.isVerified && (
                <Badge className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Score circle */}
              <div className="relative h-24 w-24 shrink-0">
                <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={trustMetrics.trustScore >= 80 ? "hsl(var(--success, 142 76% 36%))" : trustMetrics.trustScore >= 60 ? "hsl(var(--accent))" : "hsl(var(--destructive))"}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${trustMetrics.trustScore * 2.64} 264`}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${scoreColor(trustMetrics.trustScore)}`}>
                  {Math.round(trustMetrics.trustScore)}
                </span>
              </div>

              {/* Metrics breakdown */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm flex-1">
                <div>
                  <p className="text-muted-foreground">Delivery Rate</p>
                  <p className="font-semibold">{trustMetrics.deliveryRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Review Rating</p>
                  <p className="font-semibold">{trustMetrics.reviewRating.toFixed(1)} / 5</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cancellation Rate</p>
                  <p className="font-semibold">{trustMetrics.cancellationRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Return Rate</p>
                  <p className="font-semibold">{trustMetrics.returnRate.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Lightbulb className="h-4 w-4 text-accent" /> Suggestions to improve
                </p>
                {suggestions.map((s, i) => (
                  <p key={i} className="text-sm text-muted-foreground pl-5">• {s}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <Card key={card.title} className="marketplace-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Low Stock Alerts */}
      {lowStockProducts.length > 0 && (
        <Card className="marketplace-shadow ring-1 ring-destructive/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Low Stock Alerts ({lowStockProducts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockProducts.map((p: any) => {
                const avail = p.stock - (p.reserved_stock ?? 0);
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <p className="font-medium text-sm">{p.title}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Total: {p.stock}</span>
                      {(p.reserved_stock ?? 0) > 0 && <span className="text-xs text-primary">Reserved: {p.reserved_stock}</span>}
                      <Badge variant={avail <= 0 ? "destructive" : "outline"} className="text-xs">
                        {avail <= 0 ? "Out of Stock" : `${avail} left`}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Insights */}
      {pricingSuggestions.length > 0 && (
        <Card className="marketplace-shadow">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-accent" />
              Pricing Insights ({pricingSuggestions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pricingSuggestions.slice(0, 5).map((s) => (
                <div key={s.productId} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Base: ${s.basePrice.toFixed(2)}</p>
                    <p className="font-semibold text-sm text-primary">
                      Suggested: ${s.dynamicPrice?.toFixed(2) ?? '—'}
                    </p>
                    <Badge variant="outline" className="text-xs mt-1">
                      Demand: {s.demandScore.toFixed(0)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="marketplace-shadow">
        <CardHeader>
          <CardTitle className="text-lg">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No orders yet. Your sales will appear here.</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                  <p className="font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorOverview;
