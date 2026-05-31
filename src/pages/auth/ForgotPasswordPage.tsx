import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle2, ShieldAlert } from "lucide-react";
import { sanitizeEmail } from "@/lib/sanitize";
import { checkRateLimit, RATE_LIMIT_RULES, formatRetryTime } from "@/lib/rateLimiter";
import { logAuthEvent } from "@/lib/authLog";
import AuthShell from "@/components/auth/AuthShell";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [rateLimitMsg, setRateLimitMsg] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateLimitMsg("");
    const clean = sanitizeEmail(email);
    if (!clean) return;

    const rateCheck = checkRateLimit(`reset:${clean}`, RATE_LIMIT_RULES.otpSend);
    if (!rateCheck.allowed) {
      setRateLimitMsg(`Please wait ${formatRetryTime(rateCheck.retryAfterMs)} before requesting another reset link.`);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    await logAuthEvent("password_reset_request", { email: clean, success: !error });
    if (error) {
      toast({ title: "Couldn't send reset email", description: error.message, variant: "destructive" });
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      title="Forgot password"
      description="We'll email you a link to reset it"
      footer={<Link to="/auth" className="text-accent hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <div className="text-center space-y-3 py-4">
          <CheckCircle2 className="h-12 w-12 text-accent mx-auto" />
          <p className="text-sm text-muted-foreground">
            If an account exists for <span className="text-foreground font-medium">{email}</span>, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {rateLimitMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {rateLimitMsg}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" placeholder="you@example.com" className="pl-10"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading || !!rateLimitMsg}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
};

export default ForgotPasswordPage;
