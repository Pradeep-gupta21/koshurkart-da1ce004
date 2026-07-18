import { useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Wallet, IndianRupee, CreditCard, ArrowDownToLine, Megaphone, TrendingUp, Info } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { paymentService } from "@/services/paymentService";

const VendorPayments = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();

  /**
   * In-memory fallback for the payout idempotency key.
   * sessionStorage can throw a QuotaExceededError in private-browsing mode or
   * when storage is full. The ref ensures the key survives the current page
   * lifecycle even when sessionStorage is unavailable, preventing a fresh key
   * from being silently generated on every click.
   */
  const fallbackKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Recover any in-flight intent on mount
    if (!vendorId) return;
    try {
      const existing = sessionStorage.getItem(`pending_payout_key_${vendorId}`);
      if (existing) {
        console.log('Recovered pending payout key:', '[IDEMPOTENCY_KEY_REDACTED]');
      }
    } catch (storageErr) {
      console.warn("Could not read idempotency key from session storage.", storageErr);
    }
  }, [vendorId]);

  function getOrInitPayoutKey(): string {
    let key: string | null = null;
    try {
      key = sessionStorage.getItem(`pending_payout_key_${vendorId}`);
    } catch (storageErr) {
      console.warn("Could not read idempotency key from session storage.", storageErr);
    }

    if (!key) {
      key = fallbackKeyRef.current;
    }

    if (!key) {
      key = crypto.randomUUID();
      try {
        sessionStorage.setItem(`pending_payout_key_${vendorId}`, key);
      } catch (storageErr) {
        console.warn("Could not persist idempotency key to session storage.", storageErr);
      }
      fallbackKeyRef.current = key;
    }
    return key;
  }

  function rotatePayoutKey() {
    try {
      sessionStorage.removeItem(`pending_payout_key_${vendorId}`);
    } catch (storageErr) {
      console.warn("Could not remove idempotency key from session storage.", storageErr);
    }
    fallbackKeyRef.current = null;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['vendorPayoutSummary', vendorId],
    queryFn: () => paymentService.getPayoutSummary(vendorId),
    enabled: !!vendorId,
  });

  const payouts = data?.payouts ?? [];
  const withdrawableBalance = data?.withdrawableBalance ?? 0;
  const totalEarnings = data?.totalEarnings ?? 0;
  const adSpend = data?.adSpend ?? 0;
  const totalPaidOut = data?.totalPaidOut ?? 0;
  const pendingPayouts = data?.pendingPayouts ?? 0;

  const requestPayoutMutation = useMutation({
    mutationFn: async () => {
      if (withdrawableBalance <= 0) throw new Error("No balance available");
      const idempotencyKey = getOrInitPayoutKey();
      return paymentService.requestPayout(vendorId, withdrawableBalance, undefined, idempotencyKey);
    },
    onSuccess: () => {
      rotatePayoutKey();
      toast({
        title: "Payout request submitted",
        description: "Our team will review and process your request shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ['vendorPayoutSummary', vendorId] });
    },
    onError: (err: any) => {
      const message: string = err?.message ?? "";
      const httpStatus: number = err?.status ?? 0;

      // Fix 7: Distinguish retryable (5xx / network) from non-retryable (4xx)
      // errors so the UI gives the user accurate guidance.
      const isClientError = (httpStatus >= 400 && httpStatus < 500);

      if (message.startsWith("IDEMPOTENCY_TERMINAL:")) {
        // Terminal key: the last payout attempt failed/cancelled. Rotate the key
        // so a fresh click creates a new request.
        rotatePayoutKey();
        toast({
          title: "Previous request failed",
          description: "This payout attempt was already cancelled or failed. Click \"Request Payout\" again to start a new request.",
          variant: "destructive",
        });
      } else if (isClientError) {
        // Fix 7: 4xx — definitive server rejection, do NOT retry.
        // Rotate the key so the next attempt starts clean.
        rotatePayoutKey();
        toast({
          title: "Payout request failed (not retryable)",
          description: message || "The request was rejected. Please review and try again.",
          variant: "destructive",
        });
      } else {
        // 5xx or network error — state is uncertain; keep the idempotency key
        // so a future click retries the same operation idempotently.
        toast({
          title: "Network timeout — payout status uncertain",
          description: "We could not confirm your payout request. Please refresh the page in a few minutes and check your payout history before trying again.",
          variant: "destructive",
        });
      }
    }
  });

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
        <Button onClick={() => requestPayoutMutation.mutate()} disabled={withdrawableBalance <= 0 || isLoading || requestPayoutMutation.isPending}>
          <Wallet className="h-4 w-4 mr-2" />
          {requestPayoutMutation.isPending ? "Requesting…" : "Request Payout"}
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
