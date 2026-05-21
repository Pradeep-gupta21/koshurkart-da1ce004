import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useOtpCountdown } from "@/hooks/useOtpCountdown";
import { sendOtp, verifyOtp } from "@/lib/otpClient";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Phone } from "lucide-react";

const MAX_RESENDS = 3;

function maskPhone(p: string) {
  if (p.length < 6) return p;
  return `${p.slice(0, 3)} •••• ${p.slice(-3)}`;
}

const OtpVerifyPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const phone = params.get("phone") ?? "";
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [error, setError] = useState("");
  const { seconds, restart, canResend } = useOtpCountdown(30);

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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (code.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      await verifyOtp(phone, code);
      toast({ title: "Signed in" });
      await routeAfterLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || resendCount >= MAX_RESENDS) return;
    setResending(true);
    setError("");
    try {
      await sendOtp(phone);
      setResendCount((c) => c + 1);
      setCode("");
      restart(30);
      toast({ title: "New code sent" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell title="Verify your phone" description={`Enter the 6-digit code we sent to ${maskPhone(phone)}`}>
      <form onSubmit={handleVerify} className="space-y-6">
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={verifying || code.length !== 6}>
          {verifying ? "Verifying..." : "Verify & Sign In"}
        </Button>

        <div className="text-center text-sm">
          {!canResend ? (
            <p className="text-muted-foreground">
              Resend code in <span className="font-medium text-foreground">{seconds}s</span>
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
              className="text-accent hover:underline font-medium"
            >
              {resending ? "Sending..." : `Resend code (${MAX_RESENDS - resendCount} left)`}
            </button>
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
