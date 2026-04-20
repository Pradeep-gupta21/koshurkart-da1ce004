import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OnboardingFieldGroup from "./OnboardingFieldGroup";
import PhoneOtpInput from "./PhoneOtpInput";
import { User, ShieldCheck } from "lucide-react";
import { step1Schema, type Step1 } from "@/lib/validators/vendorOnboardingSchema";

interface Props {
  initial: Partial<Step1>;
  email: string;
  defaultName: string;
  onChange: (data: Partial<Step1>, valid: boolean) => void;
  errors?: Partial<Record<keyof Step1, string>>;
}

const Step1BasicInfo = ({ initial, email, defaultName, onChange, errors }: Props) => {
  const [fullName, setFullName] = useState(initial.full_name ?? defaultName ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [verified, setVerified] = useState(!!initial.phone_verified);

  useEffect(() => {
    const candidate = { full_name: fullName, email, phone, phone_verified: verified };
    const parsed = step1Schema.safeParse(candidate);
    onChange({ full_name: fullName, phone, phone_verified: verified }, parsed.success && verified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, phone, verified]);

  return (
    <div className="space-y-5">
      <OnboardingFieldGroup
        title="Tell us about you"
        description="We pre-filled what we know from your account. Confirm or update."
        icon={User}
      >
        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="As per PAN card"
          />
          {errors?.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} readOnly disabled />
          <p className="text-xs text-muted-foreground">
            Linked to your account. Update from Profile if needed.
          </p>
        </div>
      </OnboardingFieldGroup>

      <OnboardingFieldGroup
        title="Verify your phone"
        description="We use this for order alerts and account recovery."
        icon={ShieldCheck}
      >
        <PhoneOtpInput
          value={phone}
          onChange={(p) => {
            setPhone(p);
            if (verified) setVerified(false);
          }}
          verified={verified}
          onVerified={() => setVerified(true)}
          error={errors?.phone}
        />
      </OnboardingFieldGroup>
    </div>
  );
};

export default Step1BasicInfo;
