import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { paymentService } from "@/services/paymentService";
import { orderService } from "@/services/orderService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Image as ImageIcon, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

type Payment = {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  payment_method: string;
  payment_provider: string | null;
  payment_status: string;
  transaction_id: string | null;
  payment_proof: string | null;
  upi_id: string | null;
  qr_code_url: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
};

type PaymentLog = {
  id: string;
  payment_id: string;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "success") return "default";
  if (s === "failed") return "destructive";
  if (s === "pending_verification" || s === "pending") return "secondary";
  if (s === "refunded" || s === "reversed") return "outline";
  return "outline";
};

const AdminPayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Payment | null>(null);
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const fetchPayments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error) setPayments((data as Payment[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchPayments(); }, []);

  // Load logs + subscribe to realtime when a payment is selected
  useEffect(() => {
    if (!selected) { setLogs([]); return; }
    let cancelled = false;
    const load = async () => {
      setLogsLoading(true);
      const { data } = await supabase
        .from("payment_logs")
        .select("*")
        .eq("payment_id", selected.id)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setLogs((data as PaymentLog[]) ?? []);
        setLogsLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`payment_logs:${selected.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "payment_logs", filter: `payment_id=eq.${selected.id}` },
        (payload) => setLogs((prev) => [...prev, payload.new as PaymentLog])
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selected]);

  const handleApprove = async (p: Payment) => {
    setActionLoading(p.id);
    try {
      if (p.payment_method === "upi") {
        await paymentService.verifyUpiPayment(p.id, p.order_id, "approve");
      } else {
        await paymentService.updatePaymentStatus(p.id, "success");
        await orderService.updateOrderStatus(p.order_id, { payment_status: "paid", order_status: "confirmed" });
      }
      toast({ title: "Payment approved", description: `Payment for order ${p.order_id.slice(0, 8)} marked as success.` });
      fetchPayments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to approve payment.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handleReject = async (p: Payment) => {
    setActionLoading(p.id);
    try {
      if (p.payment_method === "upi") {
        await paymentService.verifyUpiPayment(p.id, p.order_id, "reject");
      } else {
        await paymentService.updatePaymentStatus(p.id, "failed");
        await orderService.updateOrderStatus(p.order_id, { payment_status: "failed" });
      }
      toast({ title: "Payment rejected", description: `Payment for order ${p.order_id.slice(0, 8)} marked as failed.` });
      fetchPayments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reject payment.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handleResync = async (p: Payment) => {
    if (!p.razorpay_order_id && !p.razorpay_payment_id) {
      toast({ title: "Cannot re-sync", description: "No Razorpay reference on this payment.", variant: "destructive" });
      return;
    }
    setResyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-resync-payment", {
        body: { payment_id: p.id },
      });
      if (error) throw error;
      toast({
        title: "Re-sync complete",
        description: (data as { status?: string })?.status
          ? `Status from Razorpay: ${(data as { status: string }).status}`
          : "Payment refreshed from Razorpay.",
      });
      await fetchPayments();
      // refresh selected payment reference
      const { data: fresh } = await supabase.from("payments").select("*").eq("id", p.id).maybeSingle();
      if (fresh) setSelected(fresh as Payment);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Re-sync failed.";
      toast({ title: "Re-sync failed", description: msg, variant: "destructive" });
    }
    setResyncing(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) =>
      p.order_id.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.razorpay_order_id ?? "").toLowerCase().includes(q) ||
      (p.razorpay_payment_id ?? "").toLowerCase().includes(q) ||
      (p.transaction_id ?? "").toLowerCase().includes(q)
    );
  }, [payments, search]);

  const buckets = useMemo(() => ({
    all: filtered,
    success: filtered.filter((p) => p.payment_status === "success"),
    pending: filtered.filter((p) => p.payment_status === "pending" || p.payment_status === "pending_verification"),
    failed: filtered.filter((p) => p.payment_status === "failed"),
    refunded: filtered.filter((p) => p.payment_status === "refunded" || p.payment_status === "reversed"),
  }), [filtered]);

  const renderTable = (list: Payment[]) => {
    if (loading) {
      return (
        <div className="space-y-2 py-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      );
    }
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Razorpay</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No payments found.</TableCell></TableRow>
            )}
            {list.map((p) => (
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(p)}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(p.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-xs">{p.order_id.slice(0, 8)}</TableCell>
                <TableCell className="capitalize">{p.payment_method}</TableCell>
                <TableCell className="capitalize text-sm text-muted-foreground">{p.payment_provider ?? "—"}</TableCell>
                <TableCell className="text-right font-medium">₹{Number(p.amount).toFixed(2)}</TableCell>
                <TableCell><Badge variant={statusVariant(p.payment_status)}>{p.payment_status}</Badge></TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {p.razorpay_payment_id ?? p.razorpay_order_id ?? "—"}
                </TableCell>
                <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                  {p.payment_proof && (
                    <Button size="icon" variant="ghost" aria-label="View payment proof" onClick={() => setProofUrl(p.payment_proof)}>
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  )}
                  {p.payment_status === "pending_verification" && (
                    <>
                      <Button size="sm" variant="default" disabled={actionLoading === p.id} onClick={() => handleApprove(p)}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" disabled={actionLoading === p.id} onClick={() => handleReject(p)}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                  {(p.payment_status === "failed" || p.payment_status === "pending") && (p.razorpay_order_id || p.razorpay_payment_id) && (
                    <Button size="sm" variant="outline" onClick={() => handleResync(p)} disabled={resyncing}>
                      {resyncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                      Re-sync
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-muted-foreground">Monitor transactions, inspect logs, and recover failed payments.</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search order / razorpay id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
          <Button variant="outline" onClick={fetchPayments} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{buckets.all.length}</Badge></TabsTrigger>
          <TabsTrigger value="success">Success <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{buckets.success.length}</Badge></TabsTrigger>
          <TabsTrigger value="pending">Pending <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{buckets.pending.length}</Badge></TabsTrigger>
          <TabsTrigger value="failed">Failed <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{buckets.failed.length}</Badge></TabsTrigger>
          <TabsTrigger value="refunded">Refunded <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{buckets.refunded.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="all">{renderTable(buckets.all)}</TabsContent>
        <TabsContent value="success">{renderTable(buckets.success)}</TabsContent>
        <TabsContent value="pending">{renderTable(buckets.pending)}</TabsContent>
        <TabsContent value="failed">{renderTable(buckets.failed)}</TabsContent>
        <TabsContent value="refunded">{renderTable(buckets.refunded)}</TabsContent>
      </Tabs>

      <Dialog open={!!proofUrl} onOpenChange={() => setProofUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Payment Proof</DialogTitle></DialogHeader>
          {proofUrl && <img src={proofUrl} alt="Payment proof" referrerPolicy="no-referrer" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col">
          <SheetHeader>
            <SheetTitle>Payment Details</SheetTitle>
            <SheetDescription>
              {selected && (
                <span className="font-mono text-xs">{selected.id}</span>
              )}
            </SheetDescription>
          </SheetHeader>

          {selected && (
            <div className="space-y-4 mt-4 flex-1 flex flex-col overflow-hidden">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-muted-foreground text-xs">Order</div><div className="font-mono">{selected.order_id.slice(0, 12)}</div></div>
                <div><div className="text-muted-foreground text-xs">Amount</div><div>₹{Number(selected.amount).toFixed(2)}</div></div>
                <div><div className="text-muted-foreground text-xs">Method</div><div className="capitalize">{selected.payment_method}</div></div>
                <div><div className="text-muted-foreground text-xs">Status</div><Badge variant={statusVariant(selected.payment_status)}>{selected.payment_status}</Badge></div>
                <div className="col-span-2">
                  <div className="text-muted-foreground text-xs">Razorpay Order ID</div>
                  <div className="font-mono text-xs break-all">{selected.razorpay_order_id ?? "—"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground text-xs">Razorpay Payment ID</div>
                  <div className="font-mono text-xs break-all">{selected.razorpay_payment_id ?? "—"}</div>
                </div>
              </div>

              <div className="flex gap-2">
                {(selected.razorpay_order_id || selected.razorpay_payment_id) && (
                  <Button size="sm" onClick={() => handleResync(selected)} disabled={resyncing}>
                    {resyncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                    Re-sync with Razorpay
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/admin/orders?order=${selected.order_id}`}>
                    <ExternalLink className="h-4 w-4 mr-1" /> View order
                  </Link>
                </Button>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="text-sm font-medium mb-2">Event Timeline</div>
                <ScrollArea className="flex-1 rounded-md border p-3">
                  {logsLoading ? (
                    <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : logs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No log events yet.</p>
                  ) : (
                    <ol className="space-y-3">
                      {logs.map((l) => (
                        <li key={l.id} className="border-l-2 border-primary/40 pl-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">{l.event_type}</span>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</span>
                          </div>
                          {l.message && <div className="text-sm mt-0.5">{l.message}</div>}
                          {l.metadata && Object.keys(l.metadata).length > 0 && (
                            <pre className="text-[10px] bg-muted/50 rounded p-1.5 mt-1 overflow-x-auto">{JSON.stringify(l.metadata, null, 2)}</pre>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminPayments;
