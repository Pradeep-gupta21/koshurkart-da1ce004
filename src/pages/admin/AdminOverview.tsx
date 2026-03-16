import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Store, ShoppingCart, Package, DollarSign, Megaphone, AlertTriangle, Trophy } from "lucide-react";
import { analyticsService } from "@/services/analyticsService";

const AdminOverview = () => {
  const [stats, setStats] = useState({ users: 0, vendors: 0, orders: 0, revenue: 0, products: 0 });
  const [loading, setLoading] = useState(true);
  const [abnormalPurchases, setAbnormalPurchases] = useState<any[]>([]);

  const { data: analytics } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => analyticsService.getAdminAnalytics(),
  });

  const { data: suspiciousClicks = [] } = useQuery({
    queryKey: ['suspicious-clicks'],
    queryFn: () => analyticsService.getSuspiciousClicks(),
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

    fetchStats();
    fetchFraud();
  }, []);

  const cards = [
    { label: "Total Users", value: stats.users, icon: Users, color: "text-primary" },
    { label: "Vendors", value: stats.vendors, icon: Store, color: "text-secondary" },
    { label: "Products", value: stats.products, icon: ShoppingCart, color: "text-accent" },
    { label: "Orders", value: stats.orders, icon: ShoppingCart, color: "text-accent" },
    { label: "Revenue", value: `$${stats.revenue.toFixed(2)}`, icon: DollarSign, color: "text-secondary" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>

      {/* Core stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-8 w-20 bg-muted animate-pulse rounded" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ad revenue & suspicious clicks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ad Revenue (Budgets)</CardTitle>
            <Megaphone className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">${(analytics?.adRevenue ?? 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className={analytics?.suspiciousClickCount ? 'ring-1 ring-destructive/30' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Suspicious Click Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${analytics?.suspiciousClickCount ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{analytics?.suspiciousClickCount ?? 0}</p>
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
                  <div>
                    <span className="font-medium">{ap.user_name || ap.user_email || 'Unknown'}</span>
                  </div>
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
    </div>
  );
};

export default AdminOverview;
