import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { vendorService } from "@/services/vendorService";
import { supabase } from "@/integrations/supabase/client";
import { kycBankSchema, kycBusinessSchema, BUSINESS_TYPES, MAX_DOC_BYTES } from "@/lib/validators/kycSchema";
import type { KYCBankForm, KYCBusinessForm } from "@/lib/validators/kycSchema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";

const STEPS = ["Business", "Bank", "Documents"] as const;

const VendorKYCPage = () => {
  const { user, vendorId, kycStatus, loading, refreshVendor } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [biz, setBiz] = useState<KYCBusinessForm>({
    business_name: "",
    business_type: "individual",
    pan_number: "",
    gstin: "",
    aadhaar_last4: "",
  });
  const [bank, setBank] = useState<KYCBankForm>({
    bank_account_holder: "",
    bank_account_number: "",
    bank_ifsc: "",
    checkout_display_name: "store",
  });
  const [docs, setDocs] = useState<{ pan?: File; address?: File; business?: File }>({});
  const [uploaded, setUploaded] = useState<{ pan?: string; address?: string; business?: string }>({});
  const [errs, setErrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading && user && !vendorId) navigate("/vendor/apply", { replace: true });
  }, [loading, user, vendorId, navigate]);

  // Prefill from existing vendor row so old vendors can edit their saved details.
  useEffect(() => {
    if (!vendorId) return;
    vendorService.getMine().then((v) => {
      if (!v) return;
      setBiz((b) => ({
        business_name: v.business_name ?? b.business_name,
        business_type: (v.business_type as any) ?? b.business_type,
        pan_number: v.pan_number ?? b.pan_number,
        gstin: v.gstin ?? "",
        aadhaar_last4: v.aadhaar_last4 ?? b.aadhaar_last4,
      }));
      setBank((bk) => ({
        bank_account_holder: v.bank_account_holder ?? bk.bank_account_holder,
        bank_account_number: "",
        bank_ifsc: v.bank_ifsc ?? bk.bank_ifsc,
        checkout_display_name: (v.checkout_display_name as "store" | "bank") ?? "store",
      }));
      setUploaded({
        pan: v.kyc_doc_pan ?? undefined,
        address: v.kyc_doc_address ?? undefined,
        business: v.kyc_doc_business ?? undefined,
      });
    }).catch(() => { /* ignore — empty form fallback */ });
  }, [vendorId]);


  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

  const handleBizNext = () => {
    const r = kycBusinessSchema.safeParse(biz);
    if (!r.success) {
      const e: Record<string, string> = {};
      r.error.issues.forEach((i) => { if (i.path[0]) e[String(i.path[0])] = i.message; });
      setErrs(e);
      return;
    }
    setErrs({});
    setBiz(r.data as KYCBusinessForm);
    setStep(1);
  };

  const handleBankNext = () => {
    const r = kycBankSchema.safeParse(bank);
    if (!r.success) {
      const e: Record<string, string> = {};
      r.error.issues.forEach((i) => { if (i.path[0]) e[String(i.path[0])] = i.message; });
      setErrs(e);
      return;
    }
    setErrs({});
    setBank(r.data);
    setStep(2);
  };

  const handleDocChange = (kind: "pan" | "address" | "business") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_DOC_BYTES) {
      toast({ title: "File too large", description: "Max 5 MB per document", variant: "destructive" });
      return;
    }
    setDocs((d) => ({ ...d, [kind]: f }));
  };

  const uploadDoc = async (kind: "pan" | "address" | "business") => {
    const f = docs[kind];
    if (!f || !user) return;
    try {
      const path = await vendorService.uploadKYCDocument(user.id, kind, f);
      setUploaded((u) => ({ ...u, [kind]: path }));
      toast({ title: `${kind.toUpperCase()} document uploaded` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!vendorId) return;
    if (!uploaded.pan || !uploaded.address) {
      toast({ title: "Documents required", description: "PAN and address proof must be uploaded.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await vendorService.submitKYC(vendorId, {
        ...biz,
        ...bank,
        kyc_doc_pan: uploaded.pan,
        kyc_doc_address: uploaded.address,
        kyc_doc_business: uploaded.business,
      });
      await refreshVendor();
      supabase.functions
        .invoke("send-transactional-email", { body: { type: "vendor_kyc_welcome" } })
        .catch((e) => console.warn("vendor welcome email failed", e));
      toast({ title: "KYC submitted", description: "We'll review your documents shortly." });
      navigate("/vendor", { replace: true });
    } catch (e: any) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;
  const alreadyApproved = kycStatus === "approved";

  return (
    <div className="min-h-[80vh] py-10 px-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>KYC Verification</CardTitle>
          <CardDescription>
            {alreadyApproved
              ? "Your KYC is already verified. You can resubmit if details have changed."
              : "Provide your business and banking details so we can verify your store."}
          </CardDescription>
          <div className="pt-3">
            <Progress value={progress} />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              {STEPS.map((s, i) => (
                <span key={s} className={i === step ? "text-foreground font-medium" : ""}>{s}</span>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>Business Name</Label>
                <Input value={biz.business_name} onChange={(e) => setBiz({ ...biz, business_name: e.target.value })} />
                {errs.business_name && <p className="text-xs text-destructive mt-1">{errs.business_name}</p>}
              </div>
              <div>
                <Label>Business Type</Label>
                <Select value={biz.business_type} onValueChange={(v: any) => setBiz({ ...biz, business_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>PAN Number</Label>
                <Input value={biz.pan_number} maxLength={10}
                  onChange={(e) => setBiz({ ...biz, pan_number: e.target.value.toUpperCase() })} />
                {errs.pan_number && <p className="text-xs text-destructive mt-1">{errs.pan_number}</p>}
              </div>
              <div>
                <Label>GSTIN <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={biz.gstin ?? ""} maxLength={15}
                  onChange={(e) => setBiz({ ...biz, gstin: e.target.value.toUpperCase() })} />
                {errs.gstin && <p className="text-xs text-destructive mt-1">{errs.gstin}</p>}
              </div>
              <div>
                <Label>Last 4 of Aadhaar</Label>
                <Input value={biz.aadhaar_last4} maxLength={4} inputMode="numeric"
                  onChange={(e) => setBiz({ ...biz, aadhaar_last4: e.target.value.replace(/\D/g, "") })} />
                {errs.aadhaar_last4 && <p className="text-xs text-destructive mt-1">{errs.aadhaar_last4}</p>}
                <p className="text-xs text-muted-foreground mt-1">We never store your full Aadhaar number.</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={handleBizNext}>Continue</Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Account Holder Name</Label>
                <Input value={bank.bank_account_holder}
                  onChange={(e) => setBank({ ...bank, bank_account_holder: e.target.value })} />
                {errs.bank_account_holder && <p className="text-xs text-destructive mt-1">{errs.bank_account_holder}</p>}
              </div>
              <div>
                <Label>Bank Account Number</Label>
                <Input value={bank.bank_account_number} inputMode="numeric"
                  onChange={(e) => setBank({ ...bank, bank_account_number: e.target.value.replace(/\D/g, "") })} />
                {errs.bank_account_number && <p className="text-xs text-destructive mt-1">{errs.bank_account_number}</p>}
                <p className="text-xs text-muted-foreground mt-1">Only the last 4 digits are stored.</p>
              </div>
              <div>
                <Label>IFSC Code</Label>
                <Input value={bank.bank_ifsc} maxLength={11}
                  onChange={(e) => setBank({ ...bank, bank_ifsc: e.target.value.toUpperCase() })} />
                {errs.bank_ifsc && <p className="text-xs text-destructive mt-1">{errs.bank_ifsc}</p>}
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <Label>Choose the name displayed to customers during checkout payment</Label>
                <RadioGroup
                  value={bank.checkout_display_name}
                  onValueChange={(v: "store" | "bank") => setBank({ ...bank, checkout_display_name: v })}
                  className="gap-2"
                >
                  <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                    <RadioGroupItem value="store" id="cdn-store" className="mt-1" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">My Store Name</p>
                      <p className="text-xs text-muted-foreground">Shows your Koshur Kart registered store name in the payment modal.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent/40 transition-colors">
                    <RadioGroupItem value="bank" id="cdn-bank" className="mt-1" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">My Registered Bank Account Holder Name</p>
                      <p className="text-xs text-muted-foreground">Shows your official personal or business legal bank holder name.</p>
                    </div>
                  </label>
                </RadioGroup>
                {errs.checkout_display_name && <p className="text-xs text-destructive mt-1">{errs.checkout_display_name}</p>}
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
                <Button onClick={handleBankNext}>Continue</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {(["pan", "address", "business"] as const).map((kind) => {
                const labelMap = {
                  pan: "PAN Card Document",
                  address: "Aadhaar Card Document",
                  business: "Business Certificate / Store Certificate (Optional)",
                } as const;
                const helperMap = {
                  pan: "Required. Clear photo or PDF of your PAN card.",
                  address: "Required. Clear photo or PDF of your Aadhaar card.",
                  business: "Optional. Trade license, GST certificate, or shop registration.",
                } as const;
                return (
                  <div key={kind} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{labelMap[kind]}</Label>
                      {uploaded[kind] && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{helperMap[kind]}</p>
                    <div className="flex gap-2">
                      <Input type="file" accept="image/*,application/pdf" onChange={handleDocChange(kind)} />
                      <Button type="button" size="sm" variant="outline" disabled={!docs[kind]} onClick={() => uploadDoc(kind)}>
                        <Upload className="h-4 w-4 mr-1" /> Upload
                      </Button>
                    </div>
                    {uploaded[kind] && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Uploaded
                      </p>
                    )}
                  </div>
                );
              })}
              {(!uploaded.pan || !uploaded.address) && (
                <p className="text-xs text-destructive">
                  Aadhaar and PAN documents are both required to submit KYC.
                </p>
              )}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={handleSubmit} disabled={submitting || !uploaded.pan || !uploaded.address}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Submit KYC
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorKYCPage;
