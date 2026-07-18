import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { paymentService } from "@/services/paymentService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Loader2, CheckCircle2, XCircle, PackageX, ImageIcon } from "lucide-react";
import { logger } from "@/lib/logger";

interface ReturnRow {
  id: string;
  order_id: string;
  title: string;
  image: string | null;
  price: number;
  quantity: number;
  return_status: string;
  return_reason: string | null;
  return_description: string | null;
  return_photos: string[] | null;
  return_requested_at: string | null;
  return_lock_key?: string | null;
  updated_at?: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  requested: { label: "Requested", cls: "bg-warning/15 text-warning border-warning/30" },
  processing: { label: "Processing", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  approved: { label: "Approved", cls: "bg-success/15 text-success border-success/30" },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  refunded: { label: "Refunded", cls: "bg-primary/15 text-primary border-primary/30" },
};

const RETURNS_QUERY_KEY = "vendor-returns";
// Namespaced sessionStorage key holding the stable idempotency key for an
// in-flight approval, so a page reload mid-operation reuses the same key and the
// Edge Function resumes rather than starting a new money movement.
const IDEMPOTENCY_STORAGE_PREFIX = "kk_return_approve_idem_";

// Idempotency-key store with a graceful fallback. sessionStorage is the durable
// tier (survives reloads); `memory` is the in-session fallback used when storage
// is blocked (private mode, disabled cookies) so retries within the same session
// still reuse the same key. `memory` is a plain object owned by a component ref.
function getOrCreateIdempotencyKey(id: string, memory: Record<string, string>): string {
  const storageKey = IDEMPOTENCY_STORAGE_PREFIX + id;
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      memory[id] = stored; // keep the in-memory mirror in sync
      return stored;
    }
  } catch {
    /* storage unavailable — fall back to memory below */
  }
  if (memory[id]) return memory[id];

  const key = crypto.randomUUID();
  memory[id] = key;
  try {
    sessionStorage.setItem(storageKey, key);
  } catch {
    /* storage blocked — the in-memory fallback already holds the key */
  }
  return key;
}

// Clear a persisted idempotency key. Called ONLY after an approval succeeds so
// that failed/pending attempts keep their key for retry continuation.
function clearIdempotencyKey(id: string, memory: Record<string, string>): void {
  delete memory[id];
  try {
    sessionStorage.removeItem(IDEMPOTENCY_STORAGE_PREFIX + id);
  } catch {
    /* nothing else to clean up */
  }
}

const VendorReturns = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [signedCache, setSignedCache] = useState<Record<string, string>>({});
  // In-memory fallback mirror of the persisted idempotency keys, keyed by order
  // item id. Used when sessionStorage is unavailable so same-session retries stay
  // stable even without durable storage.
  const idempotencyMemory = useRef<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Fix 5: Track pending actions per return ID so each card independently shows
  // its loading state and prevents duplicate submissions without blocking others.
  const [pendingReturnIds, setPendingReturnIds] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [RETURNS_QUERY_KEY, vendorId],
    queryFn: async () => {
      setError(null);
      try {
        const data = await paymentService.getReturns(vendorId);
        return data as unknown as ReturnRow[];
      } catch (err: any) {
        setError(err.message);
        toast({ title: "Error loading returns", description: err.message, variant: "destructive" });
        throw err;
      }
    },
    enabled: !!vendorId,
  });

  const signPhoto = async (path: string): Promise<string> => {
    if (signedCache[path]) return signedCache[path];
    if (path.startsWith("http")) {
      setSignedCache((c) => ({ ...c, [path]: path }));
      return path;
    }
    const { data, error } = await supabase.storage.from("return-photos").createSignedUrl(path, 300);
    if (error) {
      toast({ title: "Failed to load photo", description: error.message, variant: "destructive" });
      return "";
    }
    const url = data?.signedUrl ?? "";
    setSignedCache((c) => ({ ...c, [path]: url }));
    return url;
  };

  const openPhoto = async (path: string) => setPreviewUrl(await signPhoto(path));

  const approveMutation = useMutation({
    // Route approval through the vendor-approve-return Edge Function so the
    // Razorpay transfer reversal + customer refund happen (in that order) BEFORE
    // the DB balance reversal. The function calls the vendor_approve_return RPC
    // internally. A stable idempotency key (persisted across reloads/retries)
    // lets the function resume an in-flight operation rather than 409-ing a resend.
    mutationFn: async (id: string) => {
      const idempotencyKey = getOrCreateIdempotencyKey(id, idempotencyMemory.current);
      return paymentService.approveReturn(id, idempotencyKey);
    },
    onMutate: (id: string) => {
      // Fix 5: Mark this specific return as pending before the async call.
      setPendingReturnIds((prev) => new Set(prev).add(id));
    },
    onSuccess: (data, id) => {
      // Only clear the persisted key once the approval definitively succeeds, so
      // failed/pending attempts keep their key for retry continuation.
      clearIdempotencyKey(id, idempotencyMemory.current);
      setPendingReturnIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      queryClient.invalidateQueries({ queryKey: [RETURNS_QUERY_KEY, vendorId] });
      toast({
        title: "Return approved",
        description: data?.refund_id
          ? "Customer refunded and amount deducted from your wallet balance."
          : "Amount deducted from your wallet balance.",
      });
    },
    onError: (err: Error, id) => {
      // Preserve the idempotency key so a retry resumes the same operation.
      setPendingReturnIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      logger.error("vendor.return_approve", err.message, { id });

      // Fix 6: Classify stale-state failures by error code so the UI knows
      // whether to refresh (stale data) or wait (concurrent lock).
      if (err.message.includes("RETURN_NOT_PENDING")) {
        // Stale state: the return was already processed between UI read and backend write.
        toast({ title: "Return state changed", description: "This return is no longer pending. Refreshing…", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: [RETURNS_QUERY_KEY, vendorId] });
      } else if (err.message.includes("ROW_LOCKED_BY_ANOTHER_REQUEST")) {
        // Concurrent action: another request already owns this return's lock.
        // Don't refresh — let the other request complete, then the user can retry.
        toast({ title: "Action in progress", description: "Another request is processing this return. Please wait and try again.", variant: "default" });
      } else {
        toast({ title: "Approval failed", description: err.message, variant: "destructive" });
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await paymentService.rejectReturn(id);
    },
    onMutate: (id: string) => {
      setPendingReturnIds((prev) => new Set(prev).add(id));
    },
    onSuccess: (_data, id) => {
      setPendingReturnIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      queryClient.invalidateQueries({ queryKey: [RETURNS_QUERY_KEY, vendorId] });
      toast({ title: "Return rejected" });
    },
    onError: (err: Error, id) => {
      setPendingReturnIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      logger.error("vendor.return_reject", err.message, { id, code: (err as { code?: string }).code });
      
      if (err.message.includes("RETURN_NOT_PENDING")) {
        toast({ title: "Return state changed", description: "This return is no longer pending. Please refresh.", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: [RETURNS_QUERY_KEY, vendorId] });
      } else {
        toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
      }
    },
  });

  // Fix 5: actingId derived from the Set for button disabled/loading states.
  const actingId = (id: string) => pendingReturnIds.has(id);

  const filter = (s?: string) => (s ? rows.filter((r) => r.return_status === s) : rows);

  const renderList = (list: ReturnRow[]) => {
    if (isLoading) {
      return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }
    if (error) {
      return (
        <div className="flex flex-col items-center py-12 text-destructive">
          <XCircle className="h-8 w-8 mb-2" />
          <p className="text-sm font-medium">Could not load return requests.</p>
          <p className="text-xs opacity-80 mt-1">{error}</p>
          <Button variant="outline" size="sm" className="mt-4 border-destructive/40" onClick={() => queryClient.invalidateQueries({ queryKey: [RETURNS_QUERY_KEY, vendorId] })}>Try Again</Button>
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <PackageX className="h-8 w-8 mb-2" />
          <p className="text-sm">No return requests here.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {list.map((r) => {
          const meta = STATUS_META[r.return_status] ?? { label: r.return_status, cls: "bg-muted" };
          const total = Number(r.price) * r.quantity;
          const photos = r.return_photos ?? [];
          return (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex gap-3">
                  {r.image ? (
                    <img src={r.image} alt={r.title} className="h-16 w-16 rounded-md object-cover border" />
                  ) : (
                    <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Order #{r.order_id.slice(0, 8)} · Qty {r.quantity} · {formatPrice(total)}
                        </p>
                      </div>
                      <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                    </div>
                    {r.return_requested_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Requested {new Date(r.return_requested_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</p>
                    <p className="text-sm">{r.return_reason || "—"}</p>
                  </div>
                  {r.return_description && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comments</p>
                      <p className="text-sm whitespace-pre-wrap">{r.return_description}</p>
                    </div>
                  )}
                  {photos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Photo proof</p>
                      <div className="flex gap-2 flex-wrap">
                        {photos.map((p) => (
                          <PhotoThumb key={p} path={p} onOpen={openPhoto} signPhoto={signPhoto} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {r.return_status === "processing" && (
                  <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 mt-2 text-sm">
                    <p className="font-semibold text-blue-700 mb-1 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Stuck in Processing?
                    </p>
                    <p className="text-blue-600 text-xs mb-1">
                      This return is currently locked for processing. If it stays in this state, you can share this information with support:
                    </p>
                    <div className="font-mono text-xs text-slate-600 space-y-1 mt-2">
                      <p><strong>Idempotency Key:</strong> {r.return_lock_key || "N/A"}</p>
                      <p><strong>Last Attempt:</strong> {r.updated_at ? new Date(r.updated_at).toLocaleString() : "Unknown"}</p>
                    </div>
                  </div>
                )}

                {r.return_status === "requested" && (
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={actingId(r.id)}
                      onClick={() => rejectMutation.mutate(r.id)}
                    >
                      {actingId(r.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <><XCircle className="h-3 w-3 mr-1" /> Reject Return</>}
                    </Button>
                    <Button
                      size="sm"
                      disabled={actingId(r.id)}
                      onClick={() => approveMutation.mutate(r.id)}
                    >
                      {actingId(r.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Approve Return</>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Returns</h1>
        <p className="text-muted-foreground">Review and act on customer return requests for your products.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {(["requested", "processing", "approved", "rejected", "refunded"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{filter(s).length}</p>
              <p className="text-xs text-muted-foreground">{STATUS_META[s].label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="requested">
        <TabsList className="flex-wrap">
          <TabsTrigger value="requested">Pending ({filter("requested").length})</TabsTrigger>
          <TabsTrigger value="processing">Processing ({filter("processing").length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({filter("approved").length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({filter("rejected").length})</TabsTrigger>
          <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="requested" className="mt-4">{renderList(filter("requested"))}</TabsContent>
        <TabsContent value="processing" className="mt-4">{renderList(filter("processing"))}</TabsContent>
        <TabsContent value="approved" className="mt-4">{renderList(filter("approved"))}</TabsContent>
        <TabsContent value="rejected" className="mt-4">{renderList(filter("rejected"))}</TabsContent>
        <TabsContent value="all" className="mt-4">{renderList(rows)}</TabsContent>
      </Tabs>

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Return photo proof</DialogTitle>
          {previewUrl && <img src={previewUrl} alt="Return proof" className="w-full h-auto rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PhotoThumb = ({
  path, onOpen, signPhoto,
}: { path: string; onOpen: (p: string) => void; signPhoto: (p: string) => Promise<string> }) => {
  const [url, setUrl] = useState<string>("");
  useEffect(() => { signPhoto(path).then(setUrl); }, [path]);
  return (
    <button
      type="button"
      onClick={() => onOpen(path)}
      className="h-16 w-16 rounded-md overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition"
    >
      {url ? <img src={url} alt="proof" className="h-full w-full object-cover" /> : <Loader2 className="h-4 w-4 m-auto animate-spin" />}
    </button>
  );
};

export default VendorReturns;
