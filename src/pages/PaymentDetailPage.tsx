import { useCallback, useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/contexts/CurrencyContext";
import PaymentStatusBadge from "@/components/payments/PaymentStatusBadge";
import RetryPaymentPanel from "@/components/payments/RetryPaymentPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, Clock, ShieldQuestion, ArrowLeft } from "lucide-react";

type Payment = {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  transaction_id: string | null;
  payment_proof: string | null;
  qr_code_url: string | null;
  credited_at: string | null;
  reversed_at: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  total_amount: number;
  order_status: string;
  payment_status: string;
  order_items: { id: string; title: string; quantity: number; price: number; image: string | null }[];
};

export default function PaymentDetailPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    const { data: p } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();
    if (!p) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setPayment(p as Payment);
    const { data: o } = await supabase
      .from("orders")
      .select("id, total_amount, order_status, payment_status, order_items(id, title, quantity, price, image)")
      .eq("id", p.order_id)
      .maybeSingle();
    if (o) setOrder(o as OrderRow);
    setLoading(false);
  }, [paymentId]);

  useEffect(() => { load(); }, [load]);

  if (!user) return <Navigate to="/auth" replace />;
  if (notFound) return <Navigate to="/payments" replace />;

  if (loading || !payment) {
    return (
      <div className="container max-w-3xl py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const status = payment.payment_status;
  const isUpi = payment.payment_method === "upi";
  const isFailed = status === "failed" || status === "rejected";
  const isAwaitingVerification = status === "pending_verification";
  const isSuccess = status === "success";
  const canRetry = isFailed || (status === "pending" && (isUpi || payment.payment_method === "razorpay"));

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/payments"><ArrowLeft className="w-4 h-4 mr-1" /> All payments</Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-xl">Payment for Order #{payment.order_id.slice(0, 8)}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {new Date(payment.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                {" · "}{payment.payment_method.toUpperCase()}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{formatPrice(Number(payment.amount))}</div>
              <PaymentStatusBadge status={status} />
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Verification result</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isSuccess && (
            <div className="flex items-start gap-3 rounded-md border border-green-500/30 bg-green-500/10 p-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Payment verified</p>
                {payment.credited_at && (
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Credited on {new Date(payment.credited_at).toLocaleString("en-IN")}
                  </p>
                )}
                {payment.transaction_id && (
                  <p className="text-muted-foreground text-xs mt-0.5">Transaction ID: {payment.transaction_id}</p>
                )}
              </div>
            </div>
          )}
          {isAwaitingVerification && (
            <div className="flex items-start gap-3 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
              <ShieldQuestion className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">Awaiting admin verification</p>
                <p className="text-muted-foreground text-xs">
                  Our team is verifying your UPI transfer. You'll be notified once it's confirmed (usually within a few hours).
                </p>
                {payment.payment_proof && (
                  <a href={payment.payment_proof} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                    View your submitted proof
                  </a>
                )}
              </div>
            </div>
          )}
          {isFailed && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Payment {status === "rejected" ? "was rejected" : "failed"}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {status === "rejected"
                    ? "Our team couldn't verify this UPI transfer. You can retry below."
                    : "The payment didn't go through. You can safely retry."}
                </p>
              </div>
            </div>
          )}
          {status === "pending" && (
            <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Payment pending</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {payment.payment_method === "cod"
                    ? "Pay in cash when your order is delivered."
                    : "Complete the payment to confirm your order."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canRetry && (
        <Card>
          <CardHeader><CardTitle className="text-base">Retry payment</CardTitle></CardHeader>
          <CardContent>
            <RetryPaymentPanel payment={payment} onUpdated={load} />
          </CardContent>
        </Card>
      )}

      {order && (
        <Card>
          <CardHeader><CardTitle className="text-base">Order summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {order.order_items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  {item.image && (
                    <img src={item.image} alt={item.title} className="w-10 h-10 rounded object-cover border border-border" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                  </div>
                </div>
                <span className="font-medium shrink-0">{formatPrice(Number(item.price) * item.quantity)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex items-center justify-between font-semibold">
              <span>Total</span>
              <span>{formatPrice(Number(order.total_amount))}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
