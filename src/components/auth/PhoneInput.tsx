import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COUNTRIES = [
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+1", name: "USA", flag: "🇺🇸" },
  { code: "+44", name: "UK", flag: "🇬🇧" },
  { code: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
];

interface PhoneInputProps {
  countryCode: string;
  onCountryChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}

export default function PhoneInput({
  countryCode, onCountryChange, phone, onPhoneChange, error, disabled,
}: PhoneInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="phone">Phone number</Label>
      <div className="flex gap-2">
        <Select value={countryCode} onValueChange={onCountryChange} disabled={disabled}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                <span className="mr-2">{c.flag}</span>{c.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id="phone"
          type="tel"
          inputMode="numeric"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 15))}
          disabled={disabled}
          required
          className="flex-1"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">We'll text you a 6-digit verification code.</p>
    </div>
  );
}

export function toE164(countryCode: string, phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  const e164 = `${countryCode}${digits}`;
  if (!/^\+[1-9]\d{9,14}$/.test(e164)) return null;
  return e164;
}
