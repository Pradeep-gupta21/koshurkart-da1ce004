import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { vendorService } from "@/services/vendorService";
import { CheckCircle, ExternalLink, Loader2, XCircle } from "lucide-react";

interface Props {
  vendorId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="grid grid-cols-3 gap-2 text-sm py-1">
    <span className="text-muted-foreground">{label}</span>
    <span className="col-span-2 font-medium break-all">{value || "—"}</span>
  </div>
);

const KYCReviewSheet = ({ vendorId, open, onOpenChange, onChanged }: Props) => {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!open || !vendorId) return;
    setLoading(true);
    setReason("");
    vendorService.getKYC(vendorId).then(async (v) => {
      setData(v);
      const urls: Record<string, string> = {};
      for (const [key, path] of [["pan", v.kyc_doc_pan], ["address", v.kyc_doc_address], ["business", v.kyc_doc_business]] as const) {
        if (path) {
          try { urls[key] = await vendorService.getKYCDocSignedUrl(path); } catch {}
        }
      }
      setDocUrls(urls);
      setLoading(false);
    });
  }, [open, vendorId]);

  const handleApprove = async () => {
    if (!vendorId) return;
    setActing(true);
    try {
      await vendorService.approveKYC(vendorId);
      toast({ title: "KYC approved" });
      onChanged?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleReject = async () => {
    if (!vendorId) return;
    if (reason.trim().length < 5) {
      toast({ title: "Reason required", description: "Please provide a brief reason.", variant: "destructive" });
      return;
    }
    setActing(true);
    try {
      await vendorService.rejectKYC(vendorId, reason.trim());
      toast({ title: "KYC rejected" });
      onChanged?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>KYC Review</SheetTitle>
          <SheetDescription>Inspect submitted details and uploaded documents.</SheetDescription>
        </SheetHeader>
        {loading || !data ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5 mt-4">
            <div>
              <Badge variant={data.kyc_status === "approved" ? "default" : data.kyc_status === "rejected" ? "destructive" : "secondary"}>
                {data.kyc_status}
              </Badge>
            </div>

            <section>
              <h3 className="text-sm font-semibold mb-1">Business</h3>
              <Field label="Business name" value={data.business_name} />
              <Field label="Type" value={data.business_type} />
              <Field label="PAN" value={data.pan_number} />
              <Field label="GSTIN" value={data.gstin} />
              <Field label="Aadhaar (last 4)" value={data.aadhaar_last4} />
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-1">Bank</h3>
              <Field label="Holder" value={data.bank_account_holder} />
              <Field label="Account" value={data.bank_account_number_masked} />
              <Field label="IFSC" value={data.bank_ifsc} />
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Documents</h3>
              <div className="space-y-2">
                {(["pan", "address", "business"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between border rounded-md p-2">
                    <span className="text-sm capitalize">{k}</span>
                    {docUrls[k] ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={docUrls[k]} target="_blank" rel="noreferrer">
                          View <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not uploaded</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Decision</h3>
              <Textarea
                placeholder="Rejection reason (required to reject)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <Button onClick={handleApprove} disabled={acting} className="flex-1">
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve KYC
                </Button>
                <Button onClick={handleReject} disabled={acting} variant="destructive" className="flex-1">
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Note: approving KYC does not auto-approve the vendor. Use the verification tab afterwards.
              </p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default KYCReviewSheet;
