import { useEffect, useState, useCallback, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IndianRupee, Package, ShoppingCart, TrendingUp, AlertTriangle,
  ShieldCheck, Lightbulb, BarChart3, Wallet, Info, CreditCard,
} from "lucide-react";
import { vendorService } from "@/services/vendorService";
import { useCurrency } from "@/contexts/CurrencyContext";
import VendorGettingStarted from "@/components/vendor/VendorGettingStarted";
import VerifiedLocalSellerBadge from "@/components/product/VerifiedLocalSellerBadge";
import FromKashmirBadge from "@/components/product/FromKashmirBadge";
import { isKashmirVendor, isVerifiedLocalSeller } from "@/lib/regionUtils";
import { pricingService, PricingSuggestion } from "@/services/pricingService";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { format, subDays, parseISO } from "date-fns";

const scoreColor = (score: number) => {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-accent";
  return "text-destructive";
};

const statusColor = (status: string) => {
  switch (status) {
    case "success": case "paid": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "pending": case "pending_verification": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "failed": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
};

const VendorOverview = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const [stats, setStats] = useState({ products: 0, totalSales: 0, totalEarnings: 0, withdrawableBalance: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [paymentsChartData, setPaymentsChartData] = useState<any[]>([]);
  const [ordersChartData, setOrdersChartData] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [pricingSuggestions, setPricingSuggestions] = useState<PricingSuggestion[]>([]);
  const [trustMetrics, setTrustMetrics] = useState<{
    trustScore: number; deliveryRate: number; cancellationRate: number;
    returnRate: number; reviewRating: number; isVerified: boolean;
  } | null>(null);
  const [vendorLocality, setVendorLocality] = useState<{ pickup_state: string | null; verification_status: string; kyc_status: string } | null>(null);

  const fetchAll = useCallback(async () => {
    if (!vendorId) return;

    const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

    const [prodRes, financials, orderItemsRes, allOrderItemsRes, paymentsRes] = await Promise.all([
      supabase.from("products").select("id, title, stock, reserved_stock, low_stock_threshold, status").eq("vendor_id", vendorId),
      vendorService.getFinancials(vendorId),
      supabase.from("order_items").select("*, order_id").eq("vendor_id", vendorId).order("id", { ascending: false }).limit(5),
      supabase.from("order_items").select("id, price, quantity, order_id, vendor_id").eq("vendor_id", vendorId),
      supabase.from("payments").select("*").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }),
    ]);

    const products = prodRes.data ?? [];
    const activeProducts = products.filter((p: any) => p.status === "active");

    setStats({
      products: activeProducts.length,
      totalSales: financials.totalSales,
      totalEarnings: financials.totalEarnings,
      withdrawableBalance: financials.withdrawableBalance,
    });

    setRecentOrders(orderItemsRes.data ?? []);

    const lowStock = activeProducts.filter(
      (p: any) => (p.stock - (p.reserved_stock ?? 0)) <= (p.low_stock_threshold ?? 5)
    );
    setLowStockProducts(lowStock);

    // Filter payments that belong to this vendor's orders
    const vendorOrderIds = new Set((allOrderItemsRes.data ?? []).map((oi: any) => oi.order_id));
    const vendorPayments = (paymentsRes.data ?? []).filter((p: any) => vendorOrderIds.has(p.order_id));
    setRecentPayments(vendorPayments.slice(0, 5));

    // Aggregate earnings chart data (last 30 days)
    const earningsByDay: Record<string, number> = {};
    const ordersByDay: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const key = format(subDays(new Date(), i), "MMM dd");
      earningsByDay[key] = 0;
      ordersByDay[key] = 0;
    }

    vendorPayments.filter((p: any) => p.payment_status === "success").forEach((p: any) => {
      const key = format(parseISO(p.created_at), "MMM dd");
      if (earningsByDay[key] !== undefined) earningsByDay[key] += Number(p.vendor_earnings ?? p.amount ?? 0);
    });

    (allOrderItemsRes.data ?? []).forEach((oi: any) => {
      // We don't have created_at on order_items, so we'll use payments as proxy for orders chart too
    });

    // Use payments dates for orders chart (one payment = one order)
    vendorPayments.forEach((p: any) => {
      const key = format(parseISO(p.created_at), "MMM dd");
      if (ordersByDay[key] !== undefined) ordersByDay[key] += 1;
    });

    setPaymentsChartData(Object.entries(earningsByDay).map(([date, amount]) => ({ date, amount: Number(amount.toFixed(2)) })));
    setOrdersChartData(Object.entries(ordersByDay).map(([date, count]) => ({ date, count })));
  }, [vendorId]);

  useEffect(() => {
    fetchAll();
    if (vendorId) {
      vendorService.getTrustMetrics(vendorId).then(setTrustMetrics).catch(() => {});
      pricingService.getPricingSuggestions(vendorId).then(setPricingSuggestions).catch(() => {});
      supabase
        .from("vendors")
        .select("pickup_state, verification_status, kyc_status")
        .eq("id", vendorId)
        .single()
        .then(({ data }) => { if (data) setVendorLocality(data as any); });
    }
  }, [vendorId, fetchAll]);

  const handleNewOrder = useCallback(() => {
    toast({ title: "🛒 New order received!", description: "Your dashboard has been updated." });
    fetchAll();
  }, [fetchAll, toast]);

  useRealtimeSubscription({
    table: "order_items",
    event: "INSERT",
    filter: `vendor_id=eq.${vendorId}`,
    onPayload: handleNewOrder,
    enabled: !!vendorId,
  });

  const statCards = [
    { title: "Total Sales", value: stats.totalSales, icon: ShoppingCart, gradient: "from-primary/10 to-primary/5" },
    { title: "Total Earnings", value: formatPrice(stats.totalEarnings), icon: IndianRupee, gradient: "from-green-500/10 to-green-500/5" },
    { title: "Withdrawable", value: formatPrice(stats.withdrawableBalance), icon: Wallet, gradient: "from-accent/10 to-accent/5" },
    { title: "Active Products", value: stats.products, icon: Package, gradient: "from-secondary/10 to-secondary/5" },
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
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <p className="text-muted-foreground">Welcome to your vendor dashboard</p>
          {vendorLocality && isKashmirVendor(vendorLocality) && <FromKashmirBadge />}
          {vendorLocality && isVerifiedLocalSeller(vendorLocality) && <VerifiedLocalSellerBadge />}
        </div>
      </div>

      {vendorId && <VendorGettingStarted vendorId={vendorId} />}

      {/* Commission info banner */}
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <Info className="h-4 w-4 text-primary shrink-0" />
        <span>Platform commission is currently <strong>0%</strong>. Vendors receive <strong>100%</strong> earnings.</span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <Card key={card.title} className="marketplace-shadow overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} pointer-events-none`} />
            <CardHeader className="relative flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <div className="h-9 w-9 rounded-lg bg-background/80 flex items-center justify-center">
                <card.icon className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="marketplace-shadow">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Earnings (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={paymentsChartData}>
                  <defs>
                    <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [formatPrice(value), "Earnings"]}
                  />
                  <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="url(#earningsGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="marketplace-shadow">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-secondary" />
              Orders (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="marketplace-shadow">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Recent Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="text-muted-foreground text-sm">No payments yet.</p>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">{formatPrice(Number(p.amount))}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.payment_method} • {format(parseISO(p.created_at), "MMM dd, yyyy")}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusColor(p.payment_status)}`}>
                      {p.payment_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="marketplace-shadow">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-secondary" />
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders yet. Your sales will appear here.</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    {item.image && (
                      <img src={item.image} alt={item.title} className="h-10 w-10 rounded-md object-cover bg-muted" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <p className="font-semibold text-sm shrink-0">{formatPrice(Number(item.price) * item.quantity)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trust Score */}
      {trustMetrics && (
        <Card className="marketplace-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              Trust Score
              {trustMetrics.isVerified && (
                <Badge className="gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="relative h-24 w-24 shrink-0">
                <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                  <circle cx="50" cy="50" r="42" fill="none"
                    stroke={trustMetrics.trustScore >= 80 ? "hsl(142 76% 36%)" : trustMetrics.trustScore >= 60 ? "hsl(var(--accent))" : "hsl(var(--destructive))"}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${trustMetrics.trustScore * 2.64} 264`}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${scoreColor(trustMetrics.trustScore)}`}>
                  {Math.round(trustMetrics.trustScore)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm flex-1">
                <div><p className="text-muted-foreground">Delivery Rate</p><p className="font-semibold">{trustMetrics.deliveryRate.toFixed(1)}%</p></div>
                <div><p className="text-muted-foreground">Review Rating</p><p className="font-semibold">{trustMetrics.reviewRating.toFixed(1)} / 5</p></div>
                <div><p className="text-muted-foreground">Cancellation Rate</p><p className="font-semibold">{trustMetrics.cancellationRate.toFixed(1)}%</p></div>
                <div><p className="text-muted-foreground">Return Rate</p><p className="font-semibold">{trustMetrics.returnRate.toFixed(1)}%</p></div>
              </div>
            </div>
            {suggestions.length > 0 && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <p className="text-sm font-medium flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-accent" /> Suggestions to improve</p>
                {suggestions.map((s, i) => (<p key={i} className="text-sm text-muted-foreground pl-5">• {s}</p>))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
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
                <div key={s.productId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Base: ${s.basePrice.toFixed(2)}</p>
                    <p className="font-semibold text-sm text-primary">Suggested: ${s.dynamicPrice?.toFixed(2) ?? '—'}</p>
                    <Badge variant="outline" className="text-xs mt-1">Demand: {s.demandScore.toFixed(0)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default VendorOverview;
