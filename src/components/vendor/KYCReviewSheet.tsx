import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { vendorService } from "@/services/vendorService";
import { CheckCircle, ExternalLink, FileText, History, Loader2, Pause, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

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

const actionLabel = (a: string) => {
  const map: Record<string, string> = {
    verification_approved: "Vendor approved",
    verification_verified: "Vendor verified",
    verification_rejected: "Vendor rejected",
    verification_suspended: "Vendor suspended",
    verification_pending: "Vendor set to pending",
    kyc_approved: "KYC approved",
    kyc_rejected: "KYC rejected",
    kyc_pending: "KYC set to pending",
    bank_verified: "Bank marked verified",
    bank_unverified: "Bank marked unverified",
  };
  return map[a] || a;
};

const KYCReviewSheet = ({ vendorId, open, onOpenChange, onChanged }: Props) => {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [kycReason, setKycReason] = useState("");
  const [verificationReason, setVerificationReason] = useState("");
  const [acting, setActing] = useState(false);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [profile, setProfile] = useState<{ email?: string | null; phone?: string | null; name?: string | null } | null>(null);

  const loadAudit = async (id: string) => {
    try {
      const log = await vendorService.getVendorAuditLog(id);
      setAuditLog(log);
    } catch {
      setAuditLog([]);
    }
  };

  useEffect(() => {
    if (!open || !vendorId) return;
    setLoading(true);
    setKycReason("");
    setVerificationReason("");
    setProfile(null);
    vendorService.getKYC(vendorId).then(async (v) => {
      setData(v);
      const urls: Record<string, string> = {};
      for (const [key, path] of [["pan", v.kyc_doc_pan], ["address", v.kyc_doc_address], ["business", v.kyc_doc_business]] as const) {
        if (path) {
          try { urls[key] = await vendorService.getKYCDocSignedUrl(path); } catch {}
        }
      }
      setDocUrls(urls);
      if (v?.user_id) {
        try {
          const { data: p } = await supabase
            .from("profiles")
            .select("email, phone, name")
            .eq("id", v.user_id)
            .maybeSingle();
          setProfile(p ?? null);
        } catch { setProfile(null); }
      }
      setLoading(false);
    });
    loadAudit(vendorId);
  }, [open, vendorId]);

  const handleApproveKYC = async () => {
    if (!vendorId) return;
    setActing(true);
    try {
      await vendorService.approveKYC(vendorId);
      toast({ title: "KYC approved" });
      onChanged?.();
      await loadAudit(vendorId);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleRejectKYC = async () => {
    if (!vendorId) return;
    if (kycReason.trim().length < 5) {
      toast({ title: "Reason required", description: "Please provide a brief reason.", variant: "destructive" });
      return;
    }
    setActing(true);
    try {
      await vendorService.rejectKYC(vendorId, kycReason.trim());
      toast({ title: "KYC rejected" });
      onChanged?.();
      await loadAudit(vendorId);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleVerificationAction = async (status: "approved" | "rejected" | "suspended") => {
    if (!vendorId) return;
    if ((status === "rejected" || status === "suspended") && verificationReason.trim().length < 5) {
      toast({ title: "Reason required", description: `Please provide a reason to ${status === "rejected" ? "reject" : "suspend"}.`, variant: "destructive" });
      return;
    }
    setActing(true);
    try {
      await vendorService.updateVerificationStatus(vendorId, status, verificationReason.trim() || undefined);
      toast({ title: status === "approved" ? "Vendor approved" : status === "rejected" ? "Vendor rejected" : "Vendor suspended" });
      setData({ ...data, verification_status: status });
      setVerificationReason("");
      onChanged?.();
      await loadAudit(vendorId);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Vendor Review</SheetTitle>
          <SheetDescription>Inspect submitted details, documents, and take action.</SheetDescription>
        </SheetHeader>
        {loading || !data ? (
          <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5 mt-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.verification_status === "approved" || data.verification_status === "verified" ? "default" : data.verification_status === "rejected" || data.verification_status === "suspended" ? "destructive" : "secondary"}>
                Vendor: {data.verification_status}
              </Badge>
              <Badge variant={data.kyc_status === "approved" ? "default" : data.kyc_status === "rejected" ? "destructive" : "secondary"}>
                KYC: {data.kyc_status}
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
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold">Bank</h3>
                <div className="flex items-center gap-2">
                  <Badge variant={data.bank_verified ? "default" : "secondary"}>
                    {data.bank_verified ? "Verified" : "Unverified"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting}
                    onClick={async () => {
                      if (!vendorId) return;
                      setActing(true);
                      try {
                        await vendorService.setBankVerified(vendorId, !data.bank_verified);
                        setData({ ...data, bank_verified: !data.bank_verified });
                        toast({ title: data.bank_verified ? "Bank marked unverified" : "Bank marked verified" });
                        onChanged?.();
                        await loadAudit(vendorId);
                      } catch (e: any) {
                        toast({ title: "Failed", description: e.message, variant: "destructive" });
                      } finally { setActing(false); }
                    }}
                  >
                    {data.bank_verified ? "Unmark" : "Mark verified"}
                  </Button>
                </div>
              </div>
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

            <section className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">KYC Decision</h3>
              <Textarea
                placeholder="Rejection reason (required to reject KYC)"
                value={kycReason}
                onChange={(e) => setKycReason(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button onClick={handleApproveKYC} disabled={acting} className="flex-1">
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve KYC
                </Button>
                <Button onClick={handleRejectKYC} disabled={acting} variant="destructive" className="flex-1">
                  <XCircle className="h-4 w-4 mr-1" /> Reject KYC
                </Button>
              </div>
            </section>

            <section className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Vendor Verification</h3>
              <Textarea
                placeholder="Reason (required to reject or suspend the vendor)"
                value={verificationReason}
                onChange={(e) => setVerificationReason(e.target.value)}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => handleVerificationAction("approved")} disabled={acting} className="flex-1 min-w-[120px]">
                  <ShieldCheck className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button onClick={() => handleVerificationAction("rejected")} disabled={acting} variant="destructive" className="flex-1 min-w-[120px]">
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button onClick={() => handleVerificationAction("suspended")} disabled={acting} variant="outline" className="flex-1 min-w-[120px]">
                  <Pause className="h-4 w-4 mr-1" /> Suspend
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Approving the vendor activates their dashboard. Reject/suspend require a reason — it's shown to the vendor and logged.
              </p>
            </section>

            <section className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <History className="h-4 w-4" /> Activity Log
              </h3>
              {auditLog.length === 0 ? (
                <p className="text-xs text-muted-foreground">No actions recorded yet.</p>
              ) : (
                <ol className="space-y-2">
                  {auditLog.map((entry) => (
                    <li key={entry.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                      <div className="font-medium text-foreground">{actionLabel(entry.action)}</div>
                      <div className="text-muted-foreground">
                        {format(parseISO(entry.created_at), "MMM dd, yyyy 'at' HH:mm")}
                        {entry.previous_status && entry.new_status && (
                          <> · {entry.previous_status} → {entry.new_status}</>
                        )}
                      </div>
                      {entry.reason && (
                        <div className="text-muted-foreground italic mt-0.5">"{entry.reason}"</div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default KYCReviewSheet;
