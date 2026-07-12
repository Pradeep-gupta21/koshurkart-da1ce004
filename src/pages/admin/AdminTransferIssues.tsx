import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

type TransferIssue = {
  id: string;
  order_id: string | null;
  vendor_id: string | null;
  reason: string | null;
  amount_paise: number | null;
  resolved: boolean;
  created_at: string;
};

// payment_transfer_issues is a newly-added table that is not yet present in the
// generated Supabase types, so we reach it through a loosely-typed handle. The
// rows are re-typed as TransferIssue after the query.
const db = supabase as any;

const REASON_LABELS: Record<string, string> = {
  missing_razorpay_account_id: "Missing Razorpay account",
  share_below_min: "Share below minimum",
};

const AdminTransferIssues = () => {
  const [issues, setIssues] = useState<TransferIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchIssues = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("payment_transfer_issues")
      .select("*")
      .eq("resolved", false)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading transfer issues", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setIssues((data as TransferIssue[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchIssues(); }, []);

  const markResolved = async (id: string) => {
    setResolvingId(id);
    const { error } = await db
      .from("payment_transfer_issues")
      .update({ resolved: true })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setResolvingId(null);
      return;
    }
    toast({ title: "Marked resolved" });
    // Drop it from the unresolved list without a full refetch.
    setIssues((prev) => prev.filter((i) => i.id !== id));
    setResolvingId(null);
  };

  const formatAmount = (paise: number | null) =>
    paise == null ? "—" : `₹${(Number(paise) / 100).toFixed(2)}`;

  const reasonLabel = (reason: string | null) =>
    reason ? (REASON_LABELS[reason] ?? reason) : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transfer Issues</h1>
          <p className="text-muted-foreground">
            Vendor Route payouts that were skipped at checkout and need attention.
          </p>
        </div>
        <Button variant="outline" onClick={fetchIssues} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No transfer issues — all vendor payouts routed correctly.
                  </TableCell>
                </TableRow>
              ) : (
                issues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(issue.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {issue.order_id ? (
                        <Link
                          to={`/admin/orders?order=${issue.order_id}`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {issue.order_id.slice(0, 8)}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {issue.vendor_id ? (
                        <Link
                          to={`/admin/vendors?vendor=${issue.vendor_id}`}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {issue.vendor_id.slice(0, 8)}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" title={issue.reason ?? undefined}>
                        {reasonLabel(issue.reason)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatAmount(issue.amount_paise)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolvingId === issue.id}
                        onClick={() => markResolved(issue.id)}
                      >
                        {resolvingId === issue.id
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                        Mark Resolved
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default AdminTransferIssues;
