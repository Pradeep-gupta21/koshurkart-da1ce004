import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Wallet, IndianRupee, CreditCard, ArrowDownToLine, Megaphone, TrendingUp, Info } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { vendorService } from "@/services/vendorService";

const VendorPayments = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const [payouts, setPayouts] = useState<any[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [adSpend, setAdSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { formatPrice } = useCurrency();

  useEffect(() => {
    if (!vendorId) return;
    const fetchData = async () => {
      setLoading(true);
      const [payoutRes, financials, campaignsRes] = await Promise.all([
        supabase.from("payouts").select("*").eq("vendor_id", vendorId).order("requested_at", { ascending: false }),
        vendorService.getFinancials(vendorId),
        supabase.from("ad_campaigns").select("budget").eq("vendor_id", vendorId),
      ]);

      setPayouts(payoutRes.data ?? []);
      setTotalEarnings(financials.totalEarnings);
      setWithdrawableBalance(financials.withdrawableBalance);

      const spend = (campaignsRes.data ?? []).reduce(
        (sum: number, c: any) => sum + Number(c.budget), 0
      );
      setAdSpend(spend);
      setLoading(false);
    };
    fetchData();
  }, [vendorId]);

  const totalPaidOut = payouts.filter(p => p.status === "completed").reduce((s: number, p: any) => s + Number(p.amount), 0);
  const pendingPayouts = payouts.filter(p => p.status === "pending").reduce((s: number, p: any) => s + Number(p.amount), 0);

  const requestPayout = async () => {
    if (withdrawableBalance <= 0) { toast({ title: "No balance available" }); return; }
    // Log to the vendor-facing payout_requests ledger (status 'Requested').
    // Permissive by design: vendors with live sales but a still-pending KYC
    // can queue a request for admin review without hitting the strict
    // payouts-table trigger.
    const { error } = await supabase
      .from("payout_requests")
      .insert({ vendor_id: vendorId, amount: withdrawableBalance, status: "Requested" });
    if (error) {
      toast({
        title: "Could not submit request",
        description: error.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Payout requested", description: "Our team will review and process your request shortly." });
  };

  const cards = [
    { label: "Total Earnings", value: totalEarnings, icon: IndianRupee },
    { label: "Withdrawable", value: withdrawableBalance, icon: Wallet },
    { label: "Ad Spend", value: adSpend, icon: Megaphone },
    { label: "Paid Out", value: totalPaidOut, icon: CreditCard },
    { label: "Pending", value: pendingPayouts, icon: ArrowDownToLine },
    { label: "Net (Earnings - Ads)", value: totalEarnings - adSpend, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments & Earnings</h1>
        <p className="text-muted-foreground">Track your earnings and payouts</p>
      </div>

      {/* Commission info banner */}
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <Info className="h-4 w-4 text-primary shrink-0" />
        <span>Platform commission is currently <strong>0%</strong>. Vendors receive <strong>100%</strong> earnings.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(item => (
          <Card key={item.label} className="marketplace-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(item.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={requestPayout} disabled={withdrawableBalance <= 0 || loading}>
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
              {payouts.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{formatPrice(Number(p.amount))}</p>
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
