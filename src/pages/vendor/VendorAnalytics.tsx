import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Package, IndianRupee, Eye, MousePointerClick, Target, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ServiceFactory } from "@/services/commerce/di/ServiceFactory";
import { analyticsService } from "@/services/analyticsService";
import { TimeRangeSelector, type TimeRange } from "@/components/analytics/TimeRangeSelector";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";

const COLORS = [
  "hsl(224, 76%, 33%)",   // primary
  "hsl(142, 76%, 36%)",   // secondary/success
  "hsl(25, 95%, 53%)",    // accent
  "hsl(0, 84%, 60%)",     // destructive
  "hsl(215, 16%, 47%)",   // muted-foreground
];

const VendorAnalytics = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const [range, setRange] = useState<TimeRange>("monthly");
  const { formatPrice } = useCurrency();

  const { data: products = [] } = useQuery({
    queryKey: ['vendor-products', vendorId],
    queryFn: async () => {
      const result = await ServiceFactory.getProductService().getByVendor(vendorId);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!vendorId,
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['vendor-order-items', vendorId],
    queryFn: async () => {
      const { data } = await supabase.from('order_items').select('*').eq('vendor_id', vendorId);
      return data ?? [];
    },
    enabled: !!vendorId,
  });

  const { data: analytics } = useQuery({
    queryKey: ['vendor-analytics-events', vendorId],
    queryFn: () => analyticsService.getVendorAnalytics(vendorId),
    enabled: !!vendorId,
  });

  const { data: chartData, isLoading: chartsLoading } = useQuery({
    queryKey: ['vendor-chart-data', vendorId, range],
    queryFn: () => analyticsService.getVendorChartData(vendorId, range),
    enabled: !!vendorId,
  });

  const totalRevenue = orderItems.reduce((sum, item: any) => sum + (Number(item.price) * item.quantity), 0);
  const totalUnitsSold = orderItems.reduce((sum, item: any) => sum + item.quantity, 0);
  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const activeProducts = products.filter(p => (p.status || 'active') === 'active').length;

  const statsCards = [
    { label: "Total Revenue", value: formatPrice(totalRevenue), icon: IndianRupee },
    { label: "Units Sold", value: totalUnitsSold.toString(), icon: TrendingUp },
    { label: "Active Products", value: activeProducts.toString(), icon: Package },
    { label: "Total Stock", value: totalStock.toString(), icon: BarChart3 },
  ];

  const analyticsCards = [
    { label: "Product Views", value: analytics?.productViews?.toString() ?? '0', icon: Eye },
    { label: "Ad Impressions", value: analytics?.adImpressions?.toString() ?? '0', icon: Target },
    { label: "Ad Clicks", value: analytics?.adClicks?.toString() ?? '0', icon: MousePointerClick },
    { label: "Conversion Rate", value: `${analytics?.conversionRate ?? '0'}%`, icon: ArrowUpRight },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Track your store performance</p>
        </div>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map(item => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{item.value}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* Engagement stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {analyticsCards.map(item => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{item.value}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* Sales Revenue Chart */}
      <Card>
        <CardHeader><CardTitle>Sales Revenue</CardTitle></CardHeader>
        <CardContent>
          {chartsLoading ? (
            <div className="h-64 bg-muted animate-pulse rounded" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData?.timeSeries ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ borderRadius: '0.5rem', border: '1px solid hsl(214,32%,91%)' }} />
                <Area type="monotone" dataKey="sales" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.15} name="Revenue ($)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Views & Engagement Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Product Views</CardTitle></CardHeader>
          <CardContent>
            {chartsLoading ? (
              <div className="h-56 bg-muted animate-pulse rounded" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData?.timeSeries ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="views" fill={COLORS[1]} name="Views" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Conversion Funnel</CardTitle></CardHeader>
          <CardContent>
            {chartsLoading ? (
              <div className="h-56 bg-muted animate-pulse rounded" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={[
                  { stage: 'Views', value: chartData?.timeSeries.reduce((s, d) => s + d.views, 0) ?? 0 },
                  { stage: 'Ad Clicks', value: chartData?.timeSeries.reduce((s, d) => s + d.adClicks, 0) ?? 0 },
                  { stage: 'Purchases', value: analytics?.purchases ?? 0 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                    {[0, 1, 2].map(i => <Cell key={i} fill={COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ad Campaign Performance */}
      {(chartData?.campaignPerformance?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle>Ad Campaign Performance</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData!.campaignPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="productTitle" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="impressions" fill={COLORS[0]} name="Impressions" radius={[0, 4, 4, 0]} />
                <Bar dataKey="clicks" fill={COLORS[1]} name="Clicks" radius={[0, 4, 4, 0]} />
                <Bar dataKey="conversions" fill={COLORS[2]} name="Conversions" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Products + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top Selling Products</CardTitle></CardHeader>
          <CardContent>
            {(chartData?.topProducts?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData!.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="title" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill={COLORS[0]} name="Revenue ($)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No sales data yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sales by Category</CardTitle></CardHeader>
          <CardContent>
            {(chartData?.categoryBreakdown?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={chartData!.categoryBreakdown}
                    dataKey="revenue"
                    nameKey="category"
                    cx="50%" cy="50%"
                    outerRadius={90}
                    label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {chartData!.categoryBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatPrice(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No category data yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VendorAnalytics;
