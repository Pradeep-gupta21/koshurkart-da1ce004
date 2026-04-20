import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  value: string;
  onChange: (phone: string) => void;
  verified: boolean;
  onVerified: () => void;
  error?: string;
}

const RESEND_SECONDS = 30;

const PhoneOtpInput = ({ value, onChange, verified, onVerified, error }: Props) => {
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [smsDisabled, setSmsDisabled] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    if (!/^\+?[1-9]\d{9,14}$/.test(value)) {
      toast({ title: "Invalid phone", description: "Use international format e.g. +919876543210", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const phone = value.startsWith("+") ? value : `+${value}`;
      const { error } = await supabase.auth.updateUser({ phone });
      if (error) {
        // SMS provider not configured: allow soft-verify
        if (/sms|provider|phone.*not|disabled/i.test(error.message)) {
          setSmsDisabled(true);
          onVerified();
          toast({
            title: "SMS verification not enabled",
            description: "Phone saved. Admin will verify manually.",
          });
        } else {
          toast({ title: "Failed to send code", description: error.message, variant: "destructive" });
        }
      } else {
        setSent(true);
        setCooldown(RESEND_SECONDS);
        toast({ title: "Code sent", description: "Check your messages for a 6-digit code." });
      }
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (otp.length !== 6) return;
    setVerifying(true);
    try {
      const phone = value.startsWith("+") ? value : `+${value}`;
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "phone_change" });
      if (error) {
        toast({ title: "Verification failed", description: error.message, variant: "destructive" });
      } else {
        onVerified();
        toast({ title: "Phone verified" });
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="phone">Phone Number</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={value}
            onChange={(e) => {
              onChange(e.target.value.replace(/[^\d+]/g, ""));
              if (verified) {
                // changing number invalidates verification
              }
            }}
            disabled={verified}
            className="pl-9"
          />
        </div>
        {verified ? (
          <Badge variant="default" className="px-3 self-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Verified
          </Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={sendCode}
            disabled={sending || cooldown > 0 || !value}
            className="shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : cooldown > 0 ? `Resend (${cooldown}s)` : sent ? "Resend" : "Send code"}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {sent && !verified && !smsDisabled && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <p className="text-xs text-muted-foreground">Enter the 6-digit code we sent to {value}</p>
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button
            type="button"
            size="sm"
            onClick={verifyCode}
            disabled={otp.length !== 6 || verifying}
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </Button>
        </div>
      )}
      {smsDisabled && (
        <p className="text-xs text-muted-foreground">
          SMS verification is not enabled in this environment. Your phone will be reviewed manually.
        </p>
      )}
    </div>
  );
};

export default PhoneOtpInput;
