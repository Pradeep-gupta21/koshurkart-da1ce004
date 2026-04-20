import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import OnboardingFieldGroup from "./OnboardingFieldGroup";
import { MapPin, Loader2, AlertCircle } from "lucide-react";
import { vendorService } from "@/services/vendorService";
import { step3Schema, type Step3 } from "@/lib/validators/vendorOnboardingSchema";

interface Props {
  initial: Partial<Step3>;
  onChange: (data: Partial<Step3>, valid: boolean) => void;
  errors?: Partial<Record<keyof Step3, string>>;
}

const Step3Address = ({ initial, onChange, errors }: Props) => {
  const [line1, setLine1] = useState(initial.pickup_address_line1 ?? "");
  const [line2, setLine2] = useState(initial.pickup_address_line2 ?? "");
  const [pincode, setPincode] = useState(initial.pickup_pincode ?? "");
  const [city, setCity] = useState(initial.pickup_city ?? "");
  const [state, setState] = useState(initial.pickup_state ?? "");
  const [lookingUp, setLookingUp] = useState(false);
  const [pinNotice, setPinNotice] = useState<string | null>(null);

  // Auto-lookup city/state when pincode is valid
  useEffect(() => {
    if (!/^\d{6}$/.test(pincode)) {
      setPinNotice(null);
      return;
    }
    let alive = true;
    setLookingUp(true);
    vendorService
      .lookupPincode(pincode)
      .then((row) => {
        if (!alive) return;
        if (row) {
          setCity(row.city);
          if (row.state) setState(row.state);
          setPinNotice(null);
        } else {
          setPinNotice(
            "We don't deliver to this pincode yet — but you can still register and ship from elsewhere."
          );
        }
      })
      .finally(() => alive && setLookingUp(false));
    return () => {
      alive = false;
    };
  }, [pincode]);

  useEffect(() => {
    const data: Partial<Step3> = {
      pickup_address_line1: line1,
      pickup_address_line2: line2,
      pickup_pincode: pincode,
      pickup_city: city,
      pickup_state: state,
      pickup_country: "IN",
    };
    const parsed = step3Schema.safeParse(data);
    onChange(data, parsed.success);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line1, line2, pincode, city, state]);

  return (
    <OnboardingFieldGroup
      title="Pickup address"
      description="Where couriers will collect your orders."
      icon={MapPin}
    >
      <div className="space-y-2">
        <Label htmlFor="addr1">Address Line 1</Label>
        <Input
          id="addr1"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
          placeholder="House / building / street"
        />
        {errors?.pickup_address_line1 && (
          <p className="text-xs text-destructive">{errors.pickup_address_line1}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="addr2">Address Line 2 (optional)</Label>
        <Input
          id="addr2"
          value={line2}
          onChange={(e) => setLine2(e.target.value)}
          placeholder="Locality / landmark"
        />
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pin">PIN Code</Label>
          <div className="relative">
            <Input
              id="pin"
              value={pincode}
              maxLength={6}
              inputMode="numeric"
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
              placeholder="190001"
            />
            {lookingUp && (
              <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            )}
          </div>
          {errors?.pickup_pincode && <p className="text-xs text-destructive">{errors.pickup_pincode}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Srinagar" />
          {errors?.pickup_city && <p className="text-xs text-destructive">{errors.pickup_city}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Jammu & Kashmir"
          />
          {errors?.pickup_state && <p className="text-xs text-destructive">{errors.pickup_state}</p>}
        </div>
      </div>
      {pinNotice && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-lg border bg-muted/30 p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
          <span>{pinNotice}</span>
        </div>
      )}
    </OnboardingFieldGroup>
  );
};

export default Step3Address;
