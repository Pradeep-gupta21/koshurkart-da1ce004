import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import {
  RefreshCw, Download, ChevronDown, ChevronRight,
  AlertCircle, Truck, CircleDollarSign, Scale, ShieldCheck,
  CheckCircle2,
} from "lucide-react";

/* ─────────────────────────── Types ────────────────────────────────── */

interface AuditSummary {
  vendors_missing_destination: { count: number; total_balance_at_risk: number };
  cod_earnings: { count: number; total_amount: number };
  payout_workflow_gaps: { count: number };
  balance_discrepancies: { count: number };
}

interface MissingDestRow {
  vendor_id: string;
  store_name: string;
  verification_status: string;
  withdrawable_balance: number;
  razorpay_account_id: string | null;
  has_ifsc: boolean;
  has_upi_id: boolean;
}

interface CodRow {
  vendor_id: string;
  store_name: string;
  cod_order_count: number;
  cod_delivered_earnings: number;
  withdrawable_balance: number;
}

interface ReconRow {
  vendor_id: string;
  store_name: string;
  withdrawable_balance: number;
  route_transfer_total: number;
  cod_total: number;
  payouts_total: number;
  ledger_total: number;
  expected_balance: number;
  difference: number;
  status: "clean" | "discrepancy";
}

interface OrphanRow {
  vendor_id: string;
  store_name: string;
  pending_request_count: number;
  total_requested: number;
  reason: string;
}

interface AuditDetails {
  missing_destination: MissingDestRow[];
  cod_earnings: CodRow[];
  reconciliation: ReconRow[];
  orphaned_requests: OrphanRow[];
}

interface AuditResponse {
  summary: AuditSummary;
  details: AuditDetails;
  generated_at: string;
}

/* ─────────────────────────── Helpers ──────────────────────────────── */

const PAGE_SIZE = 20;

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toCsv(data: AuditResponse): string {
  const lines: string[] = [];

  // #14: CSV injection protection — prefix formula-like values with single quote
  const sanitizeCsvCell = (v: unknown): string => {
    const s = String(v ?? "");
    // Prefix cells starting with =, +, @, or - to prevent spreadsheet formula injection
    if (/^[=+@-]/.test(s)) return `'${s}`;
    return s;
  };

  const escape = (v: unknown) => {
    const s = sanitizeCsvCell(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const row = (cells: unknown[]) => lines.push(cells.map(escape).join(","));

  // Missing Destination
  lines.push("=== Vendors Missing Payment Destination ===");
  row(["Vendor ID", "Store Name", "Verification Status", "Withdrawable Balance", "Razorpay Account ID", "Has IFSC", "Has UPI"]);
  for (const r of data.details.missing_destination) {
    row([r.vendor_id, r.store_name, r.verification_status, r.withdrawable_balance, r.razorpay_account_id ?? "", r.has_ifsc, r.has_upi_id]);
  }
  lines.push("");

  // COD Earnings
  lines.push("=== COD Earnings (Delivered Orders) ===");
  row(["Vendor ID", "Store Name", "COD Order Count", "COD Delivered Earnings", "Withdrawable Balance"]);
  for (const r of data.details.cod_earnings) {
    row([r.vendor_id, r.store_name, r.cod_order_count, r.cod_delivered_earnings, r.withdrawable_balance]);
  }
  lines.push("");

  // Reconciliation
  lines.push("=== Balance Reconciliation ===");
  row(["Vendor ID", "Store Name", "Withdrawable Balance", "Route Transfers", "COD Total", "Payouts Total", "Ledger Total", "Expected Balance", "Difference", "Status"]);
  for (const r of data.details.reconciliation) {
    row([r.vendor_id, r.store_name, r.withdrawable_balance, r.route_transfer_total, r.cod_total, r.payouts_total, r.ledger_total, r.expected_balance, r.difference, r.status]);
  }
  lines.push("");

  // Orphaned Requests
  lines.push("=== Payout Request Orphans ===");
  row(["Vendor ID", "Store Name", "Pending Request Count", "Total Requested", "Reason"]);
  for (const r of data.details.orphaned_requests) {
    row([r.vendor_id, r.store_name, r.pending_request_count, r.total_requested, r.reason]);
  }

  return lines.join("\n");
}

function downloadCsv(data: AuditResponse) {
  const csv = toCsv(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payment-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ──────────────────── Pagination Component ────────────────────────── */

function PaginatedTable<T>({
  data,
  renderHeader,
  renderRow,
  emptyMessage,
}: {
  data: T[];
  renderHeader: () => React.ReactNode;
  renderRow: (row: T, idx: number) => React.ReactNode;
  emptyMessage: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const pageData = useMemo(
    () => data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [data, page],
  );

  // Reset page when data changes
  useEffect(() => setPage(0), [data]);

  return (
    <div className="space-y-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>{renderHeader()}</TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={99} className="text-center text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-green-500 opacity-60" />
                    <span>{emptyMessage}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pageData.map(renderRow)
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.length)} of {data.length}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────── Collapsible Section Component ───────────────────── */

function AuditSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full text-left py-2 px-1 rounded-md hover:bg-muted/50 transition-colors group">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
          )}
          <span className="font-medium text-sm">{title}</span>
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{count}</Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ────────────────────── Summary Card ──────────────────────────────── */

function SummaryCard({
  title,
  icon: Icon,
  value,
  subtitle,
  variant = "default",
}: {
  title: string;
  icon: typeof AlertCircle;
  value: string | number;
  subtitle: string;
  variant?: "destructive" | "warning" | "success" | "default";
}) {
  const borderColor = {
    destructive: "border-l-red-500",
    warning: "border-l-amber-500",
    success: "border-l-green-500",
    default: "border-l-primary",
  }[variant];

  const iconColor = {
    destructive: "text-red-500",
    warning: "text-amber-500",
    success: "text-green-500",
    default: "text-primary",
  }[variant];

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

/* ───────────────────── Skeleton Loader ─────────────────────────────── */

function AuditSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-l-4 border-l-muted">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════ Main Component ══════════════════════════════════ */

const AdminPaymentAudit = () => {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnErr } = await supabase.functions.invoke(
        "audit-payment-reconciliation",
      );
      if (fnErr) throw fnErr;
      if (result?.error) throw new Error(result.error);
      setData(result as AuditResponse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load audit data";
      console.error("audit fetch error:", err);
      setError(msg);
      toast({
        title: "Audit load failed",
        description: msg.includes("timeout")
          ? "Unable to load audit — try again in 1 minute."
          : msg,
        variant: "destructive",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payment System Reconciliation Audit</h1>
          <p className="text-muted-foreground">
            Audits vendor payment destinations, COD earnings, Route transfers, and payout workflows.
          </p>
          {data && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {new Date(data.generated_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {data && (
            <Button variant="outline" onClick={() => downloadCsv(data)}>
              <Download className="h-4 w-4 mr-1" /> Download CSV
            </Button>
          )}
          <Button variant="outline" onClick={fetchAudit} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {loading && !data && <AuditSkeleton />}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && !data && (
        <Card className="border-destructive">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchAudit}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Summary Cards ─────────────────────────────────────────────── */}
      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Vendors Missing Payment Destination"
            icon={AlertCircle}
            value={s.vendors_missing_destination.count}
            subtitle={`${fmt(s.vendors_missing_destination.total_balance_at_risk)} balance at risk`}
            variant={s.vendors_missing_destination.count > 0 ? "destructive" : "success"}
          />
          <SummaryCard
            title="COD Earnings (Delivered Orders)"
            icon={Truck}
            value={s.cod_earnings.count}
            subtitle={`${fmt(s.cod_earnings.total_amount)} total vendor earnings`}
            variant={s.cod_earnings.count > 0 ? "warning" : "default"}
          />
          <SummaryCard
            title="Payout Workflow Gaps"
            icon={CircleDollarSign}
            value={s.payout_workflow_gaps.count}
            subtitle="In-flight requests without completed payouts"
            variant={s.payout_workflow_gaps.count > 0 ? "warning" : "success"}
          />
          <SummaryCard
            title="Balance Reconciliation Status"
            icon={Scale}
            value={s.balance_discrepancies.count}
            subtitle={s.balance_discrepancies.count === 0 ? "All balances reconciled" : "Vendors with balance discrepancies"}
            variant={s.balance_discrepancies.count > 0 ? "destructive" : "success"}
          />
        </div>
      )}

      {/* ── All Clear Banner ──────────────────────────────────────────── */}
      {s && s.vendors_missing_destination.count === 0 && s.cod_earnings.count === 0 && s.payout_workflow_gaps.count === 0 && s.balance_discrepancies.count === 0 && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="py-6 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto text-green-500 mb-2" />
            <p className="font-semibold text-green-700 dark:text-green-400">All Clear</p>
            <p className="text-sm text-muted-foreground">No payment system issues detected. All vendors are properly configured.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Detail Tables ─────────────────────────────────────────────── */}
      {data && (
        <div className="space-y-2">
          {/* Table 1: Missing Destination */}
          <AuditSection
            title="Vendors Missing Payment Destination"
            count={data.details.missing_destination.length}
            defaultOpen={data.details.missing_destination.length > 0}
          >
            <PaginatedTable
              data={data.details.missing_destination}
              emptyMessage="All verified vendors have valid payment destinations."
              renderHeader={() => (
                <>
                  <TableHead>Vendor ID</TableHead>
                  <TableHead>Store Name</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Razorpay Account</TableHead>
                  <TableHead>IFSC</TableHead>
                  <TableHead>UPI</TableHead>
                </>
              )}
              renderRow={(row, idx) => (
                <TableRow key={row.vendor_id}>
                  <TableCell className="font-mono text-xs">{row.vendor_id.slice(0, 8)}…</TableCell>
                  <TableCell className="font-medium">{row.store_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.verification_status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmt(row.withdrawable_balance)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.razorpay_account_id ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.has_ifsc ? "default" : "destructive"} className="text-xs">
                      {row.has_ifsc ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.has_upi_id ? "default" : "destructive"} className="text-xs">
                      {row.has_upi_id ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                </TableRow>
              )}
            />
          </AuditSection>

          {/* Table 2: COD Earnings */}
          <AuditSection
            title="COD Earnings (Delivered Orders)"
            count={data.details.cod_earnings.length}
            defaultOpen={data.details.cod_earnings.length > 0}
          >
            <PaginatedTable
              data={data.details.cod_earnings}
              emptyMessage="No COD orders in delivered status."
              renderHeader={() => (
                <>
                  <TableHead>Vendor ID</TableHead>
                  <TableHead>Store Name</TableHead>
                  <TableHead className="text-right">COD Orders</TableHead>
                  <TableHead className="text-right">COD Earnings</TableHead>
                  <TableHead className="text-right">Withdrawable Balance</TableHead>
                </>
              )}
              renderRow={(row) => (
                <TableRow key={row.vendor_id}>
                  <TableCell className="font-mono text-xs">{row.vendor_id.slice(0, 8)}…</TableCell>
                  <TableCell className="font-medium">{row.store_name}</TableCell>
                  <TableCell className="text-right">{row.cod_order_count}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(row.cod_delivered_earnings)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(row.withdrawable_balance)}</TableCell>
                </TableRow>
              )}
            />
          </AuditSection>

          {/* Table 3: Reconciliation */}
          <AuditSection
            title="Balance Reconciliation"
            count={data.details.reconciliation.length}
            defaultOpen={data.summary.balance_discrepancies.count > 0}
          >
            <PaginatedTable
              data={data.details.reconciliation}
              emptyMessage="No vendor balances to reconcile (all zero)."
              renderHeader={() => (
                <>
                  <TableHead>Vendor ID</TableHead>
                  <TableHead>Store Name</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Route Transfers</TableHead>
                  <TableHead className="text-right">COD</TableHead>
                  <TableHead className="text-right">Payouts</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Status</TableHead>
                </>
              )}
              renderRow={(row) => (
                <TableRow key={row.vendor_id} className={row.status === "discrepancy" ? "bg-destructive/5" : ""}>
                  <TableCell className="font-mono text-xs">{row.vendor_id.slice(0, 8)}…</TableCell>
                  <TableCell className="font-medium">{row.store_name}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(row.withdrawable_balance)}</TableCell>
                  <TableCell className="text-right">{fmt(row.route_transfer_total)}</TableCell>
                  <TableCell className="text-right">{fmt(row.cod_total)}</TableCell>
                  <TableCell className="text-right">{fmt(row.payouts_total)}</TableCell>
                  <TableCell className={`text-right font-medium ${row.status === "discrepancy" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                    {row.difference >= 0 ? "+" : ""}{fmt(row.difference)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "clean" ? "default" : "destructive"}>
                      {row.status === "clean" ? "Clean" : "Discrepancy"}
                    </Badge>
                  </TableCell>
                </TableRow>
              )}
            />
          </AuditSection>

          {/* Table 4: Orphaned Payout Requests */}
          <AuditSection
            title="Payout Request Orphans"
            count={data.details.orphaned_requests.length}
            defaultOpen={data.details.orphaned_requests.length > 0}
          >
            <PaginatedTable
              data={data.details.orphaned_requests}
              emptyMessage="No orphaned payout requests — all workflows are complete."
              renderHeader={() => (
                <>
                  <TableHead>Vendor ID</TableHead>
                  <TableHead>Store Name</TableHead>
                  <TableHead className="text-right">Pending Requests</TableHead>
                  <TableHead className="text-right">Total Requested</TableHead>
                  <TableHead>Reason</TableHead>
                </>
              )}
              renderRow={(row) => (
                <TableRow key={row.vendor_id}>
                  <TableCell className="font-mono text-xs">{row.vendor_id.slice(0, 8)}…</TableCell>
                  <TableCell className="font-medium">{row.store_name}</TableCell>
                  <TableCell className="text-right">{row.pending_request_count}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(row.total_requested)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{row.reason}</TableCell>
                </TableRow>
              )}
            />
          </AuditSection>
        </div>
      )}
    </div>
  );
};

export default AdminPaymentAudit;
