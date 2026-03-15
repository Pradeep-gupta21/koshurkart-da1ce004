import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package, ShoppingCart, TrendingUp } from "lucide-react";

const VendorOverview = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const [stats, setStats] = useState({ products: 0, totalSales: 0, earnings: 0, campaigns: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!vendorId) return;
    const fetchStats = async () => {
      const [prodRes, campaignRes, vendorRes] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
        supabase.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
        supabase.from("vendors").select("total_sales").eq("id", vendorId).single(),
      ]);
      setStats({
        products: prodRes.count ?? 0,
        totalSales: vendorRes.data?.total_sales ?? 0,
        earnings: (vendorRes.data?.total_sales ?? 0) * 25.5, // mock avg
        campaigns: campaignRes.count ?? 0,
      });

      // Fetch recent order items for this vendor
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("*, order_id")
        .eq("vendor_id", vendorId)
        .order("id", { ascending: false })
        .limit(5);
      setRecentOrders(orderItems ?? []);
    };
    fetchStats();
  }, [vendorId]);

  const cards = [
    { title: "Total Products", value: stats.products, icon: Package, color: "text-primary" },
    { title: "Total Sales", value: stats.totalSales, icon: ShoppingCart, color: "text-secondary" },
    { title: "Earnings", value: `$${stats.earnings.toFixed(2)}`, icon: DollarSign, color: "text-accent" },
    { title: "Active Campaigns", value: stats.campaigns, icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Overview</h1>
        <p className="text-muted-foreground">Welcome to your vendor dashboard</p>
      </div>

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
