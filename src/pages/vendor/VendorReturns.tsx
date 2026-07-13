import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  requested: { label: "Requested", cls: "bg-warning/15 text-warning border-warning/30" },
  approved: { label: "Approved", cls: "bg-success/15 text-success border-success/30" },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  refunded: { label: "Refunded", cls: "bg-primary/15 text-primary border-primary/30" },
};

const VendorReturns = () => {
  const { vendorId } = useOutletContext<{ vendorId: string }>();
  const { toast } = useToast();
  const { formatPrice } = useCurrency();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [signedCache, setSignedCache] = useState<Record<string, string>>({});

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("order_items")
      .select("id, order_id, title, image, price, quantity, return_status, return_reason, return_description, return_photos, return_requested_at")
      .eq("vendor_id", vendorId)
      .neq("return_status", "none")
      .order("return_requested_at", { ascending: false, nullsFirst: false });
    if (error) {
      toast({ title: "Failed to load returns", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as ReturnRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { if (vendorId) fetchRows(); }, [vendorId]);

  const signPhoto = async (path: string): Promise<string> => {
    if (signedCache[path]) return signedCache[path];
    if (path.startsWith("http")) {
      setSignedCache((c) => ({ ...c, [path]: path }));
      return path;
    }
    const { data } = await supabase.storage.from("return-photos").createSignedUrl(path, 300);
    const url = data?.signedUrl ?? "";
    setSignedCache((c) => ({ ...c, [path]: url }));
    return url;
  };

  const openPhoto = async (path: string) => setPreviewUrl(await signPhoto(path));

  const approve = async (id: string) => {
    setActing(id);
    // Route approval through the vendor-approve-return Edge Function so the
    // Razorpay transfer reversal + customer refund happen (in that order) BEFORE
    // the DB balance reversal. The function calls the vendor_approve_return RPC
    // internally, so this replaces the old direct supabase.rpc(...) call.
    const { data, error } = await supabase.functions.invoke("vendor-approve-return", {
      body: JSON.stringify({ order_item_id: id }),
    });
    setActing(null);
    if (error) {
      // functions.invoke wraps a non-2xx response in a FunctionsHttpError whose
      // `.message` is generic ("…returned a non-2xx status code"); the real,
      // stage-specific message from the function is the JSON body on `.context`.
      let message = error.message;
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = body.error as string;
      } catch {
        /* keep the generic message if the body can't be parsed */
      }
      logger.error("vendor.return_approve", message, { id });
      toast({ title: "Approval failed", description: message, variant: "destructive" });
      return;
    }
    const refunded = (data as { refund_id?: string | null } | null)?.refund_id;
    toast({
      title: "Return approved",
      description: refunded
        ? "Customer refunded and amount deducted from your wallet balance."
        : "Amount deducted from your wallet balance.",
    });
    fetchRows();
  };

  const reject = async (id: string) => {
    setActing(id);
    const { error } = await supabase.rpc("vendor_reject_return", { _order_item_id: id });
    setActing(null);
    if (error) {
      logger.error("vendor.return_reject", error.message, { id, code: (error as any).code });
      toast({ title: "Rejection failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Return rejected" });
    fetchRows();
  };

  const filter = (s?: string) => (s ? rows.filter((r) => r.return_status === s) : rows);

  const renderList = (list: ReturnRow[]) => {
    if (loading) {
      return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
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

                {r.return_status === "requested" && (
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={acting === r.id}
                      onClick={() => reject(r.id)}
                    >
                      {acting === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><XCircle className="h-3 w-3 mr-1" /> Reject Return</>}
                    </Button>
                    <Button
                      size="sm"
                      disabled={acting === r.id}
                      onClick={() => approve(r.id)}
                    >
                      {acting === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Approve Return</>}
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["requested", "approved", "rejected", "refunded"] as const).map((s) => (
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
          <TabsTrigger value="approved">Approved ({filter("approved").length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({filter("rejected").length})</TabsTrigger>
          <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="requested" className="mt-4">{renderList(filter("requested"))}</TabsContent>
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
