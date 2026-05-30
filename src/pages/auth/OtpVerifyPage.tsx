import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { useOtpCountdown } from "@/hooks/useOtpCountdown";
import { sendOtp, verifyOtp } from "@/lib/otpClient";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Phone } from "lucide-react";

const MAX_RESENDS = 3;

function maskPhone(p: string) {
  if (p.length < 6) return p;
  return `${p.slice(0, 3)} •••• ${p.slice(-3)}`;
}

function fmtMMSS(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const OtpVerifyPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const phone = params.get("phone") ?? "";
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [error, setError] = useState("");
  const { seconds, restart, canResend } = useOtpCountdown(30);
  const submittedFor = useRef<string>("");

  useEffect(() => {
    if (!phone) navigate("/auth", { replace: true });
  }, [phone, navigate]);

  const routeAfterLogin = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) return navigate("/");
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const list = roles?.map((r: any) => r.role) ?? [];
    if (list.includes("admin")) navigate("/admin");
    else if (list.includes("vendor")) navigate("/vendor");
    else navigate("/");
  };

  const doVerify = async (value: string) => {
    if (verifying) return;
    if (value.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setError("");
    setVerifying(true);
    try {
      await verifyOtp(phone, value);
      toast.success("Signed in", { description: `Welcome back, ${maskPhone(phone)}` });
      await routeAfterLogin();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setError(msg);
      toast.error("Couldn't verify code", { description: msg });
      setCode("");
      submittedFor.current = "";
    } finally {
      setVerifying(false);
    }
  };

  // Auto-submit when 6 digits entered (once per value)
  useEffect(() => {
    if (code.length === 6 && submittedFor.current !== code && !verifying) {
      submittedFor.current = code;
      void doVerify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    void doVerify(code);
  };

  const handleResend = async () => {
    if (!canResend || resendCount >= MAX_RESENDS || resending) return;
    setResending(true);
    setError("");
    try {
      await sendOtp(phone);
      setResendCount((c) => c + 1);
      setCode("");
      submittedFor.current = "";
      restart(30);
      toast.success("New code sent", { description: `Sent to ${maskPhone(phone)}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not resend code";
      setError(msg);
      toast.error("Resend failed", { description: msg });
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell title="Verify your phone" description={`Enter the 6-digit code we sent to ${maskPhone(phone)}`}>
      <form onSubmit={handleVerify} className="space-y-6">
        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            disabled={verifying}
            autoFocus
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center" role="alert">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={verifying || code.length !== 6}>
          {verifying ? "Verifying..." : "Verify & Sign In"}
        </Button>

        <div className="text-center text-sm space-y-1">
          {!canResend ? (
            <p className="text-muted-foreground">
              Resend available in <span className="font-medium text-foreground tabular-nums">{fmtMMSS(seconds)}</span>
            </p>
          ) : resendCount >= MAX_RESENDS ? (
            <p className="text-muted-foreground">
              Resend limit reached. <Link to="/auth" className="text-accent hover:underline">Try a different number</Link>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-accent hover:underline font-medium disabled:opacity-60"
            >
              {resending ? "Sending..." : `Resend code (${MAX_RESENDS - resendCount} left)`}
            </button>
          )}
          {resendCount > 0 && (
            <p className="text-xs text-muted-foreground">Didn't get it? Check your SMS filters or signal.</p>
          )}
        </div>

        <Link
          to="/auth"
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <Phone className="h-3.5 w-3.5" />
          Use a different number
        </Link>
      </form>
    </AuthShell>
  );
};

export default OtpVerifyPage;
