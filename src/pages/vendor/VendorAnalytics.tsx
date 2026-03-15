import { useOutletContext } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Eye, MousePointer } from "lucide-react";

const VendorAnalytics = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Track your store performance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Views", value: "—", icon: Eye },
          { label: "Total Clicks", value: "—", icon: MousePointer },
          { label: "Conversion Rate", value: "—", icon: TrendingUp },
          { label: "Revenue", value: "—", icon: BarChart3 },
        ].map(item => (
          <Card key={item.label} className="marketplace-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
              <p className="text-xs text-muted-foreground mt-1">Analytics data will populate with activity</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="marketplace-shadow">
        <CardHeader>
          <CardTitle>Sales Trend</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-sm">Sales chart will appear once you have order data.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorAnalytics;
