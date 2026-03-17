import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, MousePointerClick, ShoppingCart, AlertTriangle } from "lucide-react";

type SuspiciousClick = {
  id: string;
  user_id: string;
  campaign_id: string;
  click_count: number;
  window_start: string;
  flagged_at: string;
};

type AbnormalPurchase = {
  user_id: string;
  user_email: string;
  user_name: string;
  order_count: number;
  window_start: string;
};

const AdminSecurity = () => {
  const [clicks, setClicks] = useState<SuspiciousClick[]>([]);
  const [purchases, setPurchases] = useState<AbnormalPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [clicksRes, purchasesRes] = await Promise.all([
        supabase.from("suspicious_clicks").select("*").order("flagged_at", { ascending: false }).limit(50),
        supabase.rpc("detect_abnormal_purchases"),
      ]);
      setClicks(clicksRes.data ?? []);
      setPurchases((purchasesRes.data as AbnormalPurchase[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const totalAlerts = clicks.length + purchases.length;

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading security data…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          Security Alerts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor suspicious activity and fraud patterns</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalAlerts}</p>
              <p className="text-xs text-muted-foreground">Total Alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
              <MousePointerClick className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{clicks.length}</p>
              <p className="text-xs text-muted-foreground">Click Fraud Flags</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-10 w-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{purchases.length}</p>
              <p className="text-xs text-muted-foreground">Abnormal Purchase Patterns</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suspicious clicks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MousePointerClick className="h-5 w-5" />
            Suspicious Ad Clicks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clicks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No suspicious click activity detected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">User ID</th>
                    <th className="py-2 pr-4">Campaign ID</th>
                    <th className="py-2 pr-4">Clicks</th>
                    <th className="py-2 pr-4">Window Start</th>
                    <th className="py-2">Flagged At</th>
                  </tr>
                </thead>
                <tbody>
                  {clicks.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{c.user_id.slice(0, 8)}…</td>
                      <td className="py-2 pr-4 font-mono text-xs">{c.campaign_id.slice(0, 8)}…</td>
                      <td className="py-2 pr-4">
                        <Badge variant="destructive">{c.click_count}</Badge>
                      </td>
                      <td className="py-2 pr-4">{new Date(c.window_start).toLocaleString()}</td>
                      <td className="py-2">{new Date(c.flagged_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Abnormal purchases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Abnormal Purchase Patterns
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No abnormal purchase patterns detected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Orders</th>
                    <th className="py-2">Window</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p, i) => (
                    <tr key={`${p.user_id}-${i}`} className="border-b last:border-0">
                      <td className="py-2 pr-4">{p.user_name || "Unknown"}</td>
                      <td className="py-2 pr-4">{p.user_email}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="destructive">{p.order_count}</Badge>
                      </td>
                      <td className="py-2">{new Date(p.window_start).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSecurity;
