import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Wallet, DollarSign, CreditCard, ArrowDownToLine } from "lucide-react";

const VendorPayments = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const [payouts, setPayouts] = useState<any[]>([]);
  const [vendor, setVendor] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!vendorId) return;
    const fetch = async () => {
      const [payoutRes, vendorRes] = await Promise.all([
        supabase.from("payouts").select("*").eq("vendor_id", vendorId).order("requested_at", { ascending: false }),
        supabase.from("vendors").select("total_sales").eq("id", vendorId).single(),
      ]);
      setPayouts(payoutRes.data ?? []);
      setVendor(vendorRes.data);
    };
    fetch();
  }, [vendorId]);

  const totalEarnings = (vendor?.total_sales ?? 0) * 25.5;
  const totalPaidOut = payouts.filter(p => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const pendingPayouts = payouts.filter(p => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
  const available = totalEarnings - totalPaidOut - pendingPayouts;

  const requestPayout = async () => {
    if (available <= 0) { toast({ title: "No balance available" }); return; }
    const { error } = await supabase.from("payouts").insert({ vendor_id: vendorId, amount: available });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Payout requested" });
    const { data } = await supabase.from("payouts").select("*").eq("vendor_id", vendorId).order("requested_at", { ascending: false });
    setPayouts(data ?? []);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-muted-foreground">Track your earnings and payouts</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Earnings", value: `$${totalEarnings.toFixed(2)}`, icon: DollarSign },
          { label: "Paid Out", value: `$${totalPaidOut.toFixed(2)}`, icon: CreditCard },
          { label: "Pending", value: `$${pendingPayouts.toFixed(2)}`, icon: ArrowDownToLine },
          { label: "Available", value: `$${Math.max(0, available).toFixed(2)}`, icon: Wallet },
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

      <div className="flex justify-end">
        <Button onClick={requestPayout} disabled={available <= 0}>
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
                  <span className={`text-xs px-2 py-1 rounded-full ${p.status === 'completed' ? 'bg-secondary/10 text-secondary' : 'bg-accent/10 text-accent'}`}>
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
