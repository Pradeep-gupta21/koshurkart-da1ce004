import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Package, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { productService } from "@/services/productService";

const VendorAnalytics = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();

  const { data: products = [] } = useQuery({
    queryKey: ['vendor-products', vendorId],
    queryFn: () => productService.getByVendor(vendorId),
    enabled: !!vendorId,
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['vendor-order-items', vendorId],
    queryFn: async () => {
      const { data } = await supabase
        .from('order_items')
        .select('*')
        .eq('vendor_id', vendorId);
      return data ?? [];
    },
    enabled: !!vendorId,
  });

  const totalRevenue = orderItems.reduce((sum, item: any) => sum + (Number(item.price) * item.quantity), 0);
  const totalUnitsSold = orderItems.reduce((sum, item: any) => sum + item.quantity, 0);
  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const activeProducts = products.filter(p => (p.status || 'active') === 'active').length;

  // Top products by sales
  const salesByProduct: Record<string, { title: string; units: number; revenue: number }> = {};
  for (const item of orderItems) {
    const key = (item as any).product_id || 'unknown';
    if (!salesByProduct[key]) salesByProduct[key] = { title: (item as any).title, units: 0, revenue: 0 };
    salesByProduct[key].units += (item as any).quantity;
    salesByProduct[key].revenue += Number((item as any).price) * (item as any).quantity;
  }
  const topProducts = Object.values(salesByProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Track your store performance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign },
          { label: "Units Sold", value: totalUnitsSold.toString(), icon: TrendingUp },
          { label: "Active Products", value: activeProducts.toString(), icon: Package },
          { label: "Total Stock", value: totalStock.toString(), icon: BarChart3 },
        ].map(item => (
          <Card key={item.label} className="marketplace-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="marketplace-shadow">
        <CardHeader>
          <CardTitle>Top Selling Products</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.units} units sold</p>
                  </div>
                  <span className="font-semibold text-sm">${p.revenue.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Sales data will appear once you have orders.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorAnalytics;
