import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/contexts/CurrencyContext";
import { paymentService } from "@/services/paymentService";
import PaymentStatusBadge from "@/components/payments/PaymentStatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Wallet, ChevronRight } from "lucide-react";

type Payment = {
  id: string;
  order_id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
};

const FILTERS = {
  all: () => true,
  pending: (p: Payment) => p.payment_status === "pending_verification" || p.payment_status === "pending",
  failed: (p: Payment) => p.payment_status === "failed" || p.payment_status === "rejected",
  success: (p: Payment) => p.payment_status === "success",
} as const;

export default function PaymentsListPage() {
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    paymentService.getUserPayments(user.id)
      .then((rows) => setPayments(rows as Payment[]))
      .finally(() => setLoading(false));
  }, [user]);

  const renderList = (key: keyof typeof FILTERS) => {
    const filtered = payments.filter(FILTERS[key]);
    if (loading) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      );
    }
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon={Wallet}
          title="No payments here"
          description="When you place an order, it will show up in this list."
        />
      );
    }
    return (
      <div className="space-y-3">
        {filtered.map((p) => (
          <Link key={p.id} to={`/payments/${p.id}`} className="block">
            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">Order #{p.order_id.slice(0, 8)}</span>
                    <PaymentStatusBadge status={p.payment_status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(p.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    {" · "}
                    {p.payment_method.toUpperCase()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{formatPrice(Number(p.amount))}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Payments</h1>
          <p className="text-sm text-muted-foreground">Track UPI verification status and retry failed payments.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/profile">Back to profile</Link>
        </Button>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="success">Successful</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">{renderList("all")}</TabsContent>
        <TabsContent value="pending" className="mt-4">{renderList("pending")}</TabsContent>
        <TabsContent value="failed" className="mt-4">{renderList("failed")}</TabsContent>
        <TabsContent value="success" className="mt-4">{renderList("success")}</TabsContent>
      </Tabs>
    </div>
  );
}
