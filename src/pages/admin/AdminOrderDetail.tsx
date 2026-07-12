import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";

// These queries read payments.has_transfer_issues, which is a newly-added column
// not yet present in the generated Supabase types, so we reach the tables through
// a loosely-typed handle and re-type the rows locally.
const db = supabase as any;

type OrderRow = {
  id: string;
  created_at: string;
  order_status: string;
  payment_status: string;
  total_amount: number;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_pincode: string | null;
  order_notes: string | null;
  tracking_id: string | null;
};

type OrderItemRow = {
  id: string;
  title: string;
  vendor_id: string | null;
  product_id: string | null;
  quantity: number;
  price: number;
};

type PaymentRow = {
  id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  commission_percentage: number | null;
  platform_commission: number | null;
  vendor_earnings: number | null;
  has_transfer_issues: boolean | null;
  created_at: string;
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "success" || s === "paid" || s === "confirmed" || s === "delivered") return "default";
  if (s === "failed" || s === "cancelled") return "destructive";
  if (s.startsWith("pending") || s === "processing") return "secondary";
  return "outline";
};

const money = (v: number | null | undefined) => `₹${Number(v ?? 0).toFixed(2)}`;

const AdminOrderDetail = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order");

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [payment, setPayment] = useState<PaymentRow | null>(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [orderRes, itemsRes, paymentsRes] = await Promise.all([
        db.from("orders").select("*").eq("id", orderId).maybeSingle(),
        db.from("order_items").select("*").eq("order_id", orderId),
        db.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setOrder((orderRes.data as OrderRow) ?? null);
      setItems((itemsRes.data as OrderItemRow[]) ?? []);
      // An order usually has one payment; if retried there may be more — show the latest.
      setPayment(((paymentsRes.data as PaymentRow[]) ?? [])[0] ?? null);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [orderId]);

  const BackButton = (
    <Button variant="outline" size="sm" asChild>
      <Link to="/admin/payments"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
    </Button>
  );

  // ---- No id in the URL ----
  if (!orderId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Order Detail</h1>
          {BackButton}
        </div>
        <Card className="marketplace-shadow">
          <CardContent className="py-10 text-center text-muted-foreground">
            No order specified. Open this page from an order link.
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Loading ----
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Order Detail</h1>
          {BackButton}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </div>
    );
  }

  // ---- Not found ----
  if (!order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Order Detail</h1>
          {BackButton}
        </div>
        <Card className="marketplace-shadow">
          <CardContent className="py-10 text-center text-muted-foreground">
            Order <span className="font-mono">{orderId.slice(0, 8)}</span> not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Order Detail</h1>
          <p className="text-muted-foreground font-mono text-sm">{order.id}</p>
        </div>
        {BackButton}
      </div>

      {/* Order summary */}
      <Card className="marketplace-shadow">
        <CardHeader><CardTitle className="text-lg">Order Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Placed</div>
            <div>{new Date(order.created_at).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Order Status</div>
            <Badge variant={statusVariant(order.order_status)}>{order.order_status}</Badge>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Payment Status</div>
            <Badge variant={statusVariant(order.payment_status)}>{order.payment_status}</Badge>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Total</div>
            <div className="font-semibold">{money(order.total_amount)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Tracking</div>
            <div className="font-mono text-xs">{order.tracking_id ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      {/* Recipient / shipping */}
      <Card className="marketplace-shadow">
        <CardHeader><CardTitle className="text-lg">Recipient & Shipping</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Name</div>
            <div>{order.recipient_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Phone</div>
            <div>{order.recipient_phone ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Email</div>
            <div className="break-all">{order.recipient_email ?? "—"}</div>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <div className="text-muted-foreground text-xs">Address</div>
            <div>
              {[order.shipping_address, order.shipping_city, order.shipping_state, order.shipping_pincode]
                .filter(Boolean).join(", ") || "—"}
            </div>
          </div>
          {order.order_notes && (
            <div className="col-span-2 sm:col-span-3">
              <div className="text-muted-foreground text-xs">Notes</div>
              <div>{order.order_notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment & commission */}
      <Card className="marketplace-shadow">
        <CardHeader><CardTitle className="text-lg">Payment & Commission</CardTitle></CardHeader>
        <CardContent>
          {!payment ? (
            <p className="text-muted-foreground text-sm">No payment record for this order.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Method</div>
                <div className="capitalize">{payment.payment_method}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Status</div>
                <Badge variant={statusVariant(payment.payment_status)}>{payment.payment_status}</Badge>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Amount</div>
                <div>{money(payment.amount)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Commission %</div>
                <div>{payment.commission_percentage ?? 0}%</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Platform Commission</div>
                <div>{money(payment.platform_commission)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Vendor Earnings</div>
                <div>{money(payment.vendor_earnings)}</div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <div className="text-muted-foreground text-xs">Transfer Issues</div>
                {payment.has_transfer_issues ? (
                  <Link to="/admin/transfer-issues" className="inline-flex items-center gap-1 text-destructive hover:underline">
                    <AlertTriangle className="h-4 w-4" /> This order has skipped vendor transfers
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <Badge variant="outline">None</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="marketplace-shadow">
        <CardHeader><CardTitle className="text-lg">Items ({items.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No items on this order.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.title}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {it.vendor_id ? (
                          <Link
                            to={`/admin/vendors?vendor=${it.vendor_id}`}
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {it.vendor_id.slice(0, 8)}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{it.quantity}</TableCell>
                      <TableCell className="text-right">{money(it.price)}</TableCell>
                      <TableCell className="text-right font-medium">{money(Number(it.price) * Number(it.quantity))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOrderDetail;
