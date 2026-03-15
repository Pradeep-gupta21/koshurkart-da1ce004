import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Store, ShoppingCart, DollarSign } from "lucide-react";

const AdminOverview = () => {
  const [stats, setStats] = useState({ users: 0, vendors: 0, orders: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [profiles, vendors, orders] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("vendors").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("total_amount"),
      ]);

      setStats({
        users: profiles.count ?? 0,
        vendors: vendors.count ?? 0,
        orders: orders.data?.length ?? 0,
        revenue: orders.data?.reduce((sum, o) => sum + Number(o.total_amount), 0) ?? 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  const cards = [
    { label: "Total Users", value: stats.users, icon: Users, color: "text-primary" },
    { label: "Vendors", value: stats.vendors, icon: Store, color: "text-secondary" },
    { label: "Orders", value: stats.orders, icon: ShoppingCart, color: "text-accent" },
    { label: "Revenue", value: `$${stats.revenue.toFixed(2)}`, icon: DollarSign, color: "text-secondary" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Platform Overview</h1>
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
    </div>
  );
};

export default AdminOverview;
