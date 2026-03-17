import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Store, ShoppingCart, Package, DollarSign, Megaphone, AlertTriangle, Trophy, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { analyticsService } from "@/services/analyticsService";
import { TimeRangeSelector, type TimeRange } from "@/components/analytics/TimeRangeSelector";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useToast } from "@/hooks/use-toast";

const COLORS = [
  "hsl(224, 76%, 33%)",
  "hsl(142, 76%, 36%)",
  "hsl(25, 95%, 53%)",
  "hsl(0, 84%, 60%)",
  "hsl(215, 16%, 47%)",
  "hsl(280, 60%, 50%)",
];

const AdminOverview = () => {
  const { toast } = useToast();
  const [range, setRange] = useState<TimeRange>("monthly");
  const [stats, setStats] = useState({ users: 0, vendors: 0, orders: 0, revenue: 0, products: 0 });
  const [loading, setLoading] = useState(true);
  const [abnormalPurchases, setAbnormalPurchases] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);

  const { data: analytics } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => analyticsService.getAdminAnalytics(),
  });

  const { data: suspiciousClicks = [] } = useQuery({
    queryKey: ['suspicious-clicks'],
    queryFn: () => analyticsService.getSuspiciousClicks(),
  });

  const { data: chartData, isLoading: chartsLoading } = useQuery({
    queryKey: ['admin-chart-data', range],
    queryFn: () => analyticsService.getAdminChartData(range),
  });

  useEffect(() => {
    const fetchStats = async () => {
      const [profiles, vendors, orders, products] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("vendors").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("total_amount"),
        supabase.from("products").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        users: profiles.count ?? 0,
        vendors: vendors.count ?? 0,
        orders: orders.data?.length ?? 0,
        revenue: orders.data?.reduce((sum, o) => sum + Number(o.total_amount), 0) ?? 0,
        products: products.count ?? 0,
      });
      setLoading(false);
    };

    const fetchFraud = async () => {
      const { data } = await supabase.rpc("detect_abnormal_purchases");
      setAbnormalPurchases(data ?? []);
    };

    const fetchInventoryHealth = async () => {
      const { data: products } = await supabase
        .from("products")
        .select("id, title, stock, reserved_stock, low_stock_threshold, vendor_id, vendors(store_name)")
        .eq("status", "active");
      const lowStock = (products ?? []).filter(
        (p: any) => (p.stock - (p.reserved_stock ?? 0)) <= (p.low_stock_threshold ?? 5)
      );
      setLowStockProducts(lowStock);
    };

    fetchStats();
    fetchFraud();
    fetchInventoryHealth();
  }, []);

  // Real-time: new fraud alerts
  const handleFraudAlert = useCallback(() => {
    toast({ title: "🚨 Fraud alert", description: "New suspicious click activity detected." });
    supabase.rpc("detect_abnormal_purchases").then(({ data }) => setAbnormalPurchases(data ?? []));
  }, [toast]);

  useRealtimeSubscription({
    table: "suspicious_clicks",
    event: "INSERT",
    onPayload: handleFraudAlert,
  });

  // Real-time: ad campaign updates
  useRealtimeSubscription({
    table: "ad_campaigns",
    event: "UPDATE",
    onPayload: useCallback(() => {
      // Silently refresh — no toast needed for ad metric updates
    }, []),
  });

  // Real-time: new orders
  useRealtimeSubscription({
    table: "orders",
    event: "INSERT",
    onPayload: useCallback(async () => {
      const { data } = await supabase.from("orders").select("total_amount");
      setStats(prev => ({
        ...prev,
        orders: data?.length ?? prev.orders,
        revenue: data?.reduce((sum, o) => sum + Number(o.total_amount), 0) ?? prev.revenue,
      }));
    }, []),
  });

  const cards = [
    { label: "Total Users", value: stats.users, icon: Users, color: "text-primary" },
    { label: "Vendors", value: stats.vendors, icon: Store, color: "text-secondary" },
    { label: "Products", value: stats.products, icon: Package, color: "text-accent" },
    { label: "Orders", value: stats.orders, icon: ShoppingCart, color: "text-primary" },
    { label: "Revenue", value: `$${stats.revenue.toFixed(2)}`, icon: DollarSign, color: "text-secondary" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      {/* Core stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              {loading ? <div className="h-8 w-20 bg-muted animate-pulse rounded" /> : (
                <p className="text-2xl font-bold text-foreground">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader><CardTitle>Platform Revenue</CardTitle></CardHeader>
        <CardContent>
          {chartsLoading ? <div className="h-64 bg-muted animate-pulse rounded" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData?.revenueSeries ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '1px solid hsl(214,32%,91%)' }} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.15} name="Revenue ($)" />
                <Area type="monotone" dataKey="orders" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.1} name="Orders" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Ad Revenue & Vendor Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" /> Ad Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartsLoading ? <div className="h-56 bg-muted animate-pulse rounded" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData?.adRevenueSeries ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="adRevenue" stroke={COLORS[2]} strokeWidth={2} name="Ad Revenue ($)" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-4 w-4 text-secondary" /> Vendor Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartsLoading ? <div className="h-56 bg-muted animate-pulse rounded" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData?.vendorGrowth ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="newVendors" fill={COLORS[1]} name="New Vendors" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category Performance & Suspicious Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top Categories</CardTitle></CardHeader>
          <CardContent>
            {(chartData?.categoryPerformance?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={chartData!.categoryPerformance}
                    dataKey="revenue"
                    nameKey="category"
                    cx="50%" cy="50%"
                    outerRadius={100}
                    label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {chartData!.categoryPerformance.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No category data yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className={(chartData?.suspiciousTrend?.some(s => s.count > 0)) ? 'ring-1 ring-destructive/20' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Suspicious Activity Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartsLoading ? <div className="h-56 bg-muted animate-pulse rounded" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData?.suspiciousTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={COLORS[3]} strokeWidth={2} name="Flagged Events" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top vendors */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Trophy className="h-5 w-5 text-accent" />
          <CardTitle>Top Vendors by Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics?.topVendors && analytics.topVendors.length > 0 ? (
            <div className="space-y-3">
              {analytics.topVendors.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6">{i + 1}.</span>
                    <span className="font-medium text-sm">{v.name}</span>
                  </div>
                  <span className="font-semibold text-sm tabular-nums">${v.revenue.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No vendor revenue data yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Suspicious clicks detail */}
      {suspiciousClicks.length > 0 && (
        <Card className="ring-1 ring-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Flagged Suspicious Clicks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {suspiciousClicks.slice(0, 10).map((sc: any) => (
                <div key={sc.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <div>
                    <span className="font-medium">{sc.profiles?.name || sc.profiles?.email || 'Unknown user'}</span>
                    <span className="text-muted-foreground ml-2">on campaign {sc.campaign_id?.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-destructive font-semibold">{sc.click_count} clicks</span>
                    <span className="text-xs text-muted-foreground">{new Date(sc.flagged_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Abnormal purchase patterns */}
      {abnormalPurchases.length > 0 && (
        <Card className="ring-1 ring-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Abnormal Purchase Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {abnormalPurchases.map((ap: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <span className="font-medium">{ap.user_name || ap.user_email || 'Unknown'}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-destructive font-semibold">{ap.order_count} orders/hr</span>
                    <span className="text-xs text-muted-foreground">{new Date(ap.window_start).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Health */}
      <Card className={lowStockProducts.length > 0 ? 'ring-1 ring-destructive/20' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-muted-foreground" />
            Inventory Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lowStockProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">All products are well-stocked.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">{lowStockProducts.length} product(s) need attention</p>
              {lowStockProducts.slice(0, 15).map((p: any) => {
                const avail = p.stock - (p.reserved_stock ?? 0);
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                    <div>
                      <span className="font-medium">{p.title}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{p.vendors?.store_name ?? 'Unknown vendor'}</span>
                    </div>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOverview;
