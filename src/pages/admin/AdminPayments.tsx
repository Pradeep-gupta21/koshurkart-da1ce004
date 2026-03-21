import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { paymentService } from "@/services/paymentService";
import { orderService } from "@/services/orderService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Eye, Image as ImageIcon } from "lucide-react";

type Payment = {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  transaction_id: string | null;
  payment_proof: string | null;
  upi_id: string | null;
  qr_code_url: string | null;
  created_at: string;
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "success") return "default";
  if (s === "failed") return "destructive";
  if (s === "pending_verification") return "secondary";
  return "outline";
};

const AdminPayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPayments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setPayments((data as Payment[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchPayments(); }, []);

  const handleApprove = async (p: Payment) => {
    setActionLoading(p.id);
    try {
      await paymentService.updatePaymentStatus(p.id, "success");
      await orderService.updateOrderStatus(p.order_id, { payment_status: "paid", order_status: "confirmed" });
      toast({ title: "Payment approved", description: `Payment for order ${p.order_id.slice(0, 8)} marked as success.` });
      fetchPayments();
    } catch {
      toast({ title: "Error", description: "Failed to approve payment.", variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handleReject = async (p: Payment) => {
    setActionLoading(p.id);
    try {
      await paymentService.updatePaymentStatus(p.id, "failed");
      await orderService.updateOrderStatus(p.order_id, { payment_status: "failed" });
      toast({ title: "Payment rejected", description: `Payment for order ${p.order_id.slice(0, 8)} marked as failed.` });
      fetchPayments();
    } catch {
      toast({ title: "Error", description: "Failed to reject payment.", variant: "destructive" });
    }
    setActionLoading(null);
  };

  const renderTable = (list: Payment[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Proof</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.length === 0 && (
          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No payments found.</TableCell></TableRow>
        )}
        {list.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-mono text-xs">{p.order_id.slice(0, 8)}</TableCell>
            <TableCell>₹{Number(p.amount).toFixed(2)}</TableCell>
            <TableCell className="capitalize">{p.payment_method}</TableCell>
            <TableCell><Badge variant={statusVariant(p.payment_status)}>{p.payment_status}</Badge></TableCell>
            <TableCell className="text-sm text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</TableCell>
            <TableCell>
              {p.payment_proof ? (
                <Button size="icon" variant="ghost" onClick={() => setProofUrl(p.payment_proof)}>
                  <ImageIcon className="h-4 w-4" />
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right space-x-1">
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
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const pending = payments.filter(p => p.payment_status === "pending_verification");
  const success = payments.filter(p => p.payment_status === "success");
  const failed = payments.filter(p => p.payment_status === "failed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payment Verification</h1>
        <p className="text-muted-foreground">Review and verify pending UPI payments.</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending {pending.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 min-w-[20px] px-1.5 text-xs">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all">All ({payments.length})</TabsTrigger>
          <TabsTrigger value="success">Success ({success.length})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({failed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">{loading ? <p className="text-muted-foreground py-8 text-center">Loading…</p> : renderTable(pending)}</TabsContent>
        <TabsContent value="all">{renderTable(payments)}</TabsContent>
        <TabsContent value="success">{renderTable(success)}</TabsContent>
        <TabsContent value="failed">{renderTable(failed)}</TabsContent>
      </Tabs>

      <Dialog open={!!proofUrl} onOpenChange={() => setProofUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Payment Proof</DialogTitle></DialogHeader>
          {proofUrl && <img src={proofUrl} alt="Payment proof" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPayments;
