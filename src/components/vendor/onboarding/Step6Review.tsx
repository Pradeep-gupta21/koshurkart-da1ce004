import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import OnboardingFieldGroup from "./OnboardingFieldGroup";
import { Briefcase, FileCheck2, MapPin, ShieldCheck, Sparkles, User } from "lucide-react";
import type { OnboardingDraftData } from "@/lib/validators/vendorOnboardingSchema";

interface Props {
  draft: OnboardingDraftData;
  email: string;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  onJump: (step: number) => void;
}

const Row = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right break-all">{value || <em className="text-muted-foreground/60">—</em>}</span>
  </div>
);

const SectionCard = ({
  title,
  icon: Icon,
  onEdit,
  children,
}: {
  title: string;
  icon: any;
  onEdit: () => void;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h3>
      <button type="button" onClick={onEdit} className="text-xs text-primary hover:underline">
        Edit
      </button>
    </div>
    <div className="divide-y">{children}</div>
  </div>
);

const Step6Review = ({ draft, email, confirmed, onConfirm, onJump }: Props) => {
  const s1 = draft.step1 ?? {};
  const s2 = draft.step2 ?? {};
  const s3 = draft.step3 ?? {};
  const s4 = draft.step4 ?? {};
  const s5 = draft.step5 ?? {};

  return (
    <div className="space-y-5">
      <OnboardingFieldGroup
        title="Review & submit"
        description="Take a final look. You can edit any section before submitting."
        icon={ShieldCheck}
      >
        <div className="grid gap-3">
          <SectionCard title="Basic info" icon={User} onEdit={() => onJump(1)}>
            <Row label="Full name" value={s1.full_name} />
            <Row label="Email" value={email} />
            <Row label="Phone" value={s1.phone} />
            <Row label="Phone verified" value={s1.phone_verified ? "Yes" : "No"} />
          </SectionCard>

          <SectionCard title="Business details" icon={Briefcase} onEdit={() => onJump(2)}>
            <Row label="Store name" value={s2.store_name} />
            <Row label="Store URL" value={s2.store_slug ? `/store/${s2.store_slug}` : ""} />
            <Row label="Business type" value={s2.business_type} />
            <Row label="Category" value={s2.category} />
            {s2.description && <Row label="Description" value={s2.description.slice(0, 80) + (s2.description.length > 80 ? "…" : "")} />}
          </SectionCard>

          <SectionCard title="Pickup address" icon={MapPin} onEdit={() => onJump(3)}>
            <Row label="Address" value={[s3.pickup_address_line1, s3.pickup_address_line2].filter(Boolean).join(", ")} />
            <Row label="City" value={s3.pickup_city} />
            <Row label="State" value={s3.pickup_state} />
            <Row label="Pincode" value={s3.pickup_pincode} />
          </SectionCard>

          <SectionCard title="KYC" icon={FileCheck2} onEdit={() => onJump(4)}>
            <Row label="Legal name" value={s4.business_name} />
            <Row label="PAN" value={s4.pan_number} />
            {s4.gstin && <Row label="GSTIN" value={s4.gstin} />}
            <Row label="Aadhaar (last 4)" value={s4.aadhaar_last4} />
            <Row label="Bank account holder" value={s4.bank_account_holder} />
            <Row label="Account (masked)" value={s4.bank_account_number_masked} />
            <Row label="IFSC" value={s4.bank_ifsc} />
            <Row label="PAN doc" value={s4.doc_pan_path ? "Uploaded" : "Missing"} />
            <Row label="Address doc" value={s4.doc_address_path ? "Uploaded" : "Missing"} />
          </SectionCard>

          <SectionCard title="Storefront" icon={Sparkles} onEdit={() => onJump(5)}>
            <Row label="Logo" value={s5.logo_url ? "Uploaded" : "—"} />
            <Row label="Banner" value={s5.banner_url ? "Uploaded" : "—"} />
            <Row label="Tagline" value={s5.tagline} />
          </SectionCard>
        </div>

        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 mt-4">
          <Checkbox id="confirm" checked={confirmed} onCheckedChange={(v) => onConfirm(!!v)} />
          <Label htmlFor="confirm" className="text-sm leading-snug cursor-pointer">
            I confirm that the information provided is accurate. I understand my application will be
            reviewed by the admin team before my store goes live.
          </Label>
        </div>
      </OnboardingFieldGroup>
    </div>
  );
};

export default Step6Review;
