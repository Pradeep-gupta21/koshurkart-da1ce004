import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Wallet, DollarSign, CreditCard, ArrowDownToLine, Percent, Megaphone, TrendingUp } from "lucide-react";

const VendorPayments = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const [payouts, setPayouts] = useState<any[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [adSpend, setAdSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const COMMISSION_RATE = 0.1;

  useEffect(() => {
    if (!vendorId) return;
    const fetchData = async () => {
      setLoading(true);
      const [payoutRes, orderItemsRes, campaignsRes] = await Promise.all([
        supabase.from("payouts").select("*").eq("vendor_id", vendorId).order("requested_at", { ascending: false }),
        supabase.from("order_items").select("price, quantity").eq("vendor_id", vendorId),
        supabase.from("ad_campaigns").select("budget").eq("vendor_id", vendorId),
      ]);

      setPayouts(payoutRes.data ?? []);

      const sales = (orderItemsRes.data ?? []).reduce(
        (sum, item) => sum + Number(item.price) * Number(item.quantity), 0
      );
      setTotalSales(sales);

      const spend = (campaignsRes.data ?? []).reduce(
        (sum, c) => sum + Number(c.budget), 0
      );
      setAdSpend(spend);
      setLoading(false);
    };
    fetchData();
  }, [vendorId]);

  const commission = totalSales * COMMISSION_RATE;
  const netEarnings = totalSales - commission - adSpend;
  const totalPaidOut = payouts.filter(p => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const pendingPayouts = payouts.filter(p => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
  const withdrawable = Math.max(0, netEarnings - totalPaidOut - pendingPayouts);

  const requestPayout = async () => {
    if (withdrawable <= 0) { toast({ title: "No balance available" }); return; }
    const { error } = await supabase.from("payouts").insert({ vendor_id: vendorId, amount: withdrawable });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Payout requested" });
    const { data } = await supabase.from("payouts").select("*").eq("vendor_id", vendorId).order("requested_at", { ascending: false });
    setPayouts(data ?? []);
  };

  const cards = [
    { label: "Total Sales", value: totalSales, icon: DollarSign },
    { label: "Commission (10%)", value: commission, icon: Percent },
    { label: "Ad Spend", value: adSpend, icon: Megaphone },
    { label: "Net Earnings", value: netEarnings, icon: TrendingUp },
    { label: "Paid Out", value: totalPaidOut, icon: CreditCard },
    { label: "Pending", value: pendingPayouts, icon: ArrowDownToLine },
    { label: "Withdrawable", value: withdrawable, icon: Wallet },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments & Earnings</h1>
        <p className="text-muted-foreground">Track your earnings, commissions, and payouts</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(item => (
          <Card key={item.label} className="marketplace-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${item.value.toFixed(2)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={requestPayout} disabled={withdrawable <= 0 || loading}>
          <Wallet className="h-4 w-4 mr-2" /> Request Payout
        </Button>
      </div>

      <Card className="marketplace-shadow">
        <CardHeader><CardTitle>Payout History</CardTitle></CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payouts yet.</p>
          ) : (
            <div className="space-y-3">
              {payouts.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">${Number(p.amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.requested_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    p.status === 'completed' ? 'bg-secondary/10 text-secondary' :
                    p.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                    'bg-accent/10 text-accent-foreground'
                  }`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorPayments;
