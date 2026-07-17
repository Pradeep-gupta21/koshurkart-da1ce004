import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Wallet, IndianRupee, CreditCard, ArrowDownToLine, Megaphone, TrendingUp, Info } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { vendorService } from "@/services/vendorService";
import { paymentService } from "@/services/paymentService";

const VendorPayments = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const [payouts, setPayouts] = useState<any[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [adSpend, setAdSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [payoutInFlight, setPayoutInFlight] = useState(false);
  const { toast } = useToast();
  const { formatPrice } = useCurrency();

  /**
   * Stable idempotency key for the current payout attempt.
   *
   * Lifecycle rules:
   *  - Generated lazily when the user first triggers the payout flow.
   *  - The SAME key is reused if the network request fails and the user retries,
   *    ensuring the RPC deduplicates and does not double-reserve funds.
   *  - Rotated (replaced with a fresh UUID) ONLY after:
   *      a) A successful payout response (terminal success).
   *      b) The user explicitly cancels or closes the flow.
   *  - Never generated inside paymentService to avoid the "key-per-click" bug.
   */
  const payoutIdempotencyKey = useRef<string | null>(null);

  /** Return the current key, generating one if this is the first call in the flow. */
  function getOrInitPayoutKey(): string {
    if (!payoutIdempotencyKey.current) {
      payoutIdempotencyKey.current = crypto.randomUUID();
    }
    return payoutIdempotencyKey.current;
  }

  /** Rotate the key — call after terminal success or explicit cancel. */
  function rotatePayoutKey() {
    payoutIdempotencyKey.current = null;
  }

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

    // Acquire (or reuse) the stable key for this payout flow.
    // • On a network/5xx error the key is preserved so the next click retries
    //   with the same key, and the RPC safely deduplicates if the first attempt
    //   already committed server-side.
    // • On a 4xx business failure (or IDEMPOTENCY_TERMINAL) the key is rotated
    //   below so the user's next attempt is treated as a fresh transaction.
    const idempotencyKey = getOrInitPayoutKey();

    setPayoutInFlight(true);
    try {
      await paymentService.requestPayout(vendorId, withdrawableBalance, undefined, idempotencyKey);

      // ── Terminal success ──────────────────────────────────────────────────
      // Rotate the key so the user's next manual attempt starts a new transaction.
      rotatePayoutKey();

      toast({
        title: "Payout request submitted",
        description: "Our team will review and process your request shortly.",
      });

      // ── Post-success data refresh ─────────────────────────────────────────
      // This is a best-effort UI update. A failure here means the payout was
      // still submitted successfully — we surface a distinct, non-alarming
      // toast so the vendor knows to refresh manually rather than thinking the
      // payout itself failed.
      try {
        const [payoutRes, financials] = await Promise.all([
          supabase.from("payouts").select("*").eq("vendor_id", vendorId).order("requested_at", { ascending: false }),
          vendorService.getFinancials(vendorId),
        ]);
        // Guard: supabase client queries return { data, error } — they do NOT throw.
        // If we blindly call setPayouts(payoutRes.data ?? []), a failed query will
        // replace the vendor's entire payout history with an empty list because
        // data is null on error. Check error first and preserve the cached list.
        if (payoutRes.error) throw payoutRes.error;
        setPayouts(payoutRes.data ?? []);
        setWithdrawableBalance(financials.withdrawableBalance);
        setTotalEarnings(financials.totalEarnings);
      } catch {
        // Payout is confirmed — only the UI refresh failed.
        toast({
          title: "Display refresh failed",
          description: "Your payout was submitted successfully. Refresh the page to see the updated balance.",
        });
      }

    } catch (err: any) {
      const message: string = err?.message ?? "";

      if (message.startsWith("IDEMPOTENCY_TERMINAL:")) {
        // ── Terminal idempotency key ────────────────────────────────────────
        // The server has determined this key is permanently bound to a
        // failed/cancelled payout. Burn the key immediately so the user's
        // next attempt generates a fresh one and starts a clean transaction.
        rotatePayoutKey();
        toast({
          title: "Previous request failed",
          description: "This payout attempt was already cancelled or failed. Click \"Request Payout\" again to start a new request.",
          variant: "destructive",
        });

      } else if (err?.status === 400 || (err?.status >= 400 && err?.status < 500)) {
        // ── Business failure (4xx) ──────────────────────────────────────────
        // The server rejected the request for a definitive reason (insufficient
        // balance, unauthorised method, parameter mismatch, etc.). Retrying with
        // the same key will not help — burn it so the next manual attempt is
        // treated as a new transaction, and surface the server's specific message.
        rotatePayoutKey();
        toast({
          title: "Payout request failed",
          description: message || "The request was rejected. Please check your balance and try again.",
          variant: "destructive",
        });

      } else {
        // ── Network / 5xx / relay failure — UNCERTAIN STATE ────────────────
        // The key is intentionally NOT rotated here. withRetry exhausted its
        // retry budget, but the user can click again and the same key collapses
        // any duplicate onto the already-committed RPC row.
        //
        // ⚠ Do NOT claim the payout failed or that funds were not deducted.
        // This is the Two-Generals problem: the request may have reached the
        // server, locked the balance, and fully committed before the network
        // dropped. Asserting "no funds were charged" could be factually wrong.
        toast({
          title: "Network timeout — payout status uncertain",
          description:
            "We could not confirm your payout request. Please refresh the page in a few minutes and check your payout history before trying again.",
          variant: "destructive",
        });
      }
    } finally {
      setPayoutInFlight(false);
    }
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
        <Button onClick={requestPayout} disabled={withdrawableBalance <= 0 || loading || payoutInFlight}>
          <Wallet className="h-4 w-4 mr-2" />
          {payoutInFlight ? "Requesting…" : "Request Payout"}
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
