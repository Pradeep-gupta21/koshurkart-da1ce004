import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OnboardingFieldGroup from "./OnboardingFieldGroup";
import FileDropzone from "./FileDropzone";
import { CreditCard, FileCheck2, Landmark } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { vendorService } from "@/services/vendorService";
import { step4Schema, type Step4 } from "@/lib/validators/vendorOnboardingSchema";

interface Props {
  initial: Partial<Step4> & { bank_account_number?: string };
  onChange: (data: Partial<Step4> & { bank_account_number?: string }, valid: boolean) => void;
  errors?: Partial<Record<keyof Step4, string>>;
}

const Step4KYC = ({ initial, onChange, errors }: Props) => {
  const { user } = useAuth();
  const [businessName, setBusinessName] = useState(initial.business_name ?? "");
  const [pan, setPan] = useState(initial.pan_number ?? "");
  const [gstin, setGstin] = useState(initial.gstin ?? "");
  const [aadhaar, setAadhaar] = useState(initial.aadhaar_last4 ?? "");
  const [holder, setHolder] = useState(initial.bank_account_holder ?? "");
  const [acct, setAcct] = useState(initial.bank_account_number ?? "");
  const [ifsc, setIfsc] = useState(initial.bank_ifsc ?? "");
  const [docPan, setDocPan] = useState(initial.doc_pan_path ?? "");
  const [docAddr, setDocAddr] = useState(initial.doc_address_path ?? "");
  const [docBiz, setDocBiz] = useState(initial.doc_business_path ?? "");

  useEffect(() => {
    const data = {
      business_name: businessName,
      pan_number: pan,
      gstin,
      aadhaar_last4: aadhaar,
      bank_account_holder: holder,
      bank_account_number: acct,
      bank_ifsc: ifsc,
      doc_pan_path: docPan,
      doc_address_path: docAddr,
      doc_business_path: docBiz,
    };
    const parsed = step4Schema.safeParse(data);
    onChange(data, parsed.success);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName, pan, gstin, aadhaar, holder, acct, ifsc, docPan, docAddr, docBiz]);

  const upload = async (kind: "pan" | "address" | "business", file: File) => {
    if (!user) throw new Error("Not signed in");
    const path = await vendorService.uploadKYCDocument(user.id, kind, file);
    if (kind === "pan") setDocPan(path);
    if (kind === "address") setDocAddr(path);
    if (kind === "business") setDocBiz(path);
  };

  return (
    <div className="space-y-5">
      <OnboardingFieldGroup title="Identity" icon={FileCheck2}>
        <div className="space-y-2">
          <Label htmlFor="biz_name">Legal Business Name</Label>
          <Input id="biz_name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          {errors?.business_name && <p className="text-xs text-destructive">{errors.business_name}</p>}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pan">PAN Number</Label>
            <Input
              id="pan"
              value={pan}
              maxLength={10}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
            />
            {errors?.pan_number && <p className="text-xs text-destructive">{errors.pan_number}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstin">
              GSTIN <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="gstin"
              value={gstin ?? ""}
              maxLength={15}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
            />
            {errors?.gstin && <p className="text-xs text-destructive">{errors.gstin}</p>}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="aad">Last 4 of Aadhaar</Label>
          <Input
            id="aad"
            value={aadhaar}
            maxLength={4}
            inputMode="numeric"
            onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))}
            className="max-w-[120px]"
          />
          <p className="text-xs text-muted-foreground">We never store your full Aadhaar number.</p>
          {errors?.aadhaar_last4 && <p className="text-xs text-destructive">{errors.aadhaar_last4}</p>}
        </div>
      </OnboardingFieldGroup>

      <OnboardingFieldGroup
        title="Bank details"
        description="Where we'll send your earnings. Only the last 4 digits are stored."
        icon={Landmark}
      >
        <div className="space-y-2">
          <Label htmlFor="holder">Account Holder Name</Label>
          <Input id="holder" value={holder} onChange={(e) => setHolder(e.target.value)} />
          {errors?.bank_account_holder && (
            <p className="text-xs text-destructive">{errors.bank_account_holder}</p>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="acct">Bank Account Number</Label>
            <Input
              id="acct"
              value={acct}
              inputMode="numeric"
              onChange={(e) => setAcct(e.target.value.replace(/\D/g, ""))}
            />
            {errors?.bank_account_number && (
              <p className="text-xs text-destructive">{errors.bank_account_number}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ifsc">IFSC Code</Label>
            <Input
              id="ifsc"
              value={ifsc}
              maxLength={11}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
            />
            {errors?.bank_ifsc && <p className="text-xs text-destructive">{errors.bank_ifsc}</p>}
          </div>
        </div>
      </OnboardingFieldGroup>

      <OnboardingFieldGroup
        title="Documents"
        description="JPG/PNG/PDF up to 5 MB. Files are encrypted and only visible to admins."
        icon={CreditCard}
      >
        <FileDropzone
          label="PAN Card"
          hint="Clear photo or scan"
          uploadedPath={docPan}
          onUpload={(f) => upload("pan", f)}
          onRemove={() => setDocPan("")}
        />
        <FileDropzone
          label="Address Proof"
          hint="Aadhaar, utility bill, passport"
          uploadedPath={docAddr}
          onUpload={(f) => upload("address", f)}
          onRemove={() => setDocAddr("")}
        />
        <FileDropzone
          label="Business Proof (optional)"
          hint="GST certificate, MoA, etc."
          uploadedPath={docBiz}
          onUpload={(f) => upload("business", f)}
          onRemove={() => setDocBiz("")}
        />
      </OnboardingFieldGroup>
    </div>
  );
};

export default Step4KYC;
