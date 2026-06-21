import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Store, ShieldAlert, MailCheck, AlertCircle } from "lucide-react";
import { loginSchema, signupSchema } from "@/lib/validators/securitySchema";
import { sanitizeEmail, sanitizeText } from "@/lib/sanitize";
import { checkRateLimit, RATE_LIMIT_RULES, formatRetryTime } from "@/lib/rateLimiter";
import { logAuthEvent } from "@/lib/authLog";
import AuthShell from "@/components/auth/AuthShell";
import PhoneInput, { toE164 } from "@/components/auth/PhoneInput";
import { sendOtp } from "@/lib/otpClient";
import { AUTH_CALLBACK_URL, getAuthCallbackUrl } from "@/lib/authConfig";
import { useSearchParams } from "react-router-dom";

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

type SignupPanelState =
  | { kind: "sent"; email: string }
  | { kind: "repeated"; email: string }
  | null;

const RESEND_COOLDOWN_SECONDS = 60;

const AuthPage = () => {
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [isVendorSignup, setIsVendorSignup] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [rateLimitMsg, setRateLimitMsg] = useState("");
  const [signupPanel, setSignupPanel] = useState<SignupPanelState>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const cooldownTimer = useRef<number | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "oauth_vendor_restricted") {
      toast({
        title: "Access Restricted",
        description:
          "Vendor and Admin accounts cannot sign in using Google. Please use your Email/Password or Phone Authentication.",
        variant: "destructive",
      });
      const next = new URLSearchParams(searchParams);
      next.delete("error");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownTimer.current = window.setTimeout(
      () => setResendCooldown((s) => s - 1),
      1000
    );
    return () => {
      if (cooldownTimer.current) window.clearTimeout(cooldownTimer.current);
    };
  }, [resendCooldown]);

  const resetSignupPanel = () => {
    setSignupPanel(null);
    setResendCooldown(0);
  };

  const handleResendVerification = async (email: string) => {
    if (resendCooldown > 0 || resending) return;
    const rateCheck = checkRateLimit(`resend:${email}`, RATE_LIMIT_RULES.otpSend);
    if (!rateCheck.allowed) {
      toast({
        title: "Please wait",
        description: `Try again in ${formatRetryTime(rateCheck.retryAfterMs)}.`,
        variant: "destructive",
      });
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    setResending(false);
    if (error) {
      toast({
        title: "Couldn't resend",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    await logAuthEvent("signup_success", { email, metadata: { resend: true } });
    toast({
      title: "Verification email resent",
      description: `Sent to ${email}. Check your inbox (and spam folder).`,
    });
  };

  const switchToLoginWithEmail = (email: string) => {
    setLoginEmail(email);
    setActiveTab("login");
    resetSignupPanel();
  };

  const routeAfterLogin = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) return navigate("/");
    const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const userRoles = rolesData?.map((r: any) => r.role) ?? [];
    if (userRoles.includes("admin")) navigate("/admin");
    else if (userRoles.includes("vendor")) navigate("/vendor");
    else navigate("/");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setRateLimitMsg("");

    const sanitizedEmail = sanitizeEmail(loginEmail);
    const result = loginSchema.safeParse({ email: sanitizedEmail, password: loginPassword });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => (fieldErrors[i.path[0] as string] = i.message));
      setErrors(fieldErrors);
      return;
    }

    const rateCheck = checkRateLimit(`login:${sanitizedEmail}`, RATE_LIMIT_RULES.loginAttempts);
    if (!rateCheck.allowed) {
      setRateLimitMsg(`Too many login attempts. Try again in ${formatRetryTime(rateCheck.retryAfterMs)}.`);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password: loginPassword,
    });
    setLoading(false);
    if (error) {
      await logAuthEvent("login_failure", { email: sanitizedEmail, success: false, metadata: { reason: error.message } });
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      return;
    }
    await logAuthEvent("login_success", { email: sanitizedEmail });
    toast({ title: "Welcome back!" });
    await routeAfterLogin();
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!agreedToTerms) {
      setErrors({ terms: "You must accept the Terms & Conditions to create an account." });
      return;
    }


    const sanitizedName = sanitizeText(signupName);
    const sanitizedEmail = sanitizeEmail(signupEmail);
    const sanitizedStore = sanitizeText(storeName);

    const result = signupSchema.safeParse({
      name: sanitizedName,
      email: sanitizedEmail,
      password: signupPassword,
      storeName: isVendorSignup ? sanitizedStore : undefined,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => (fieldErrors[i.path[0] as string] = i.message));
      setErrors(fieldErrors);
      return;
    }
    if (isVendorSignup && !sanitizedStore) {
      setErrors({ storeName: "Store name is required" });
      return;
    }

    setLoading(true);
    const metadata: Record<string, string | boolean> = {
      name: sanitizedName,
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    };
    if (isVendorSignup && sanitizedStore) {
      metadata.store_name = sanitizedStore;
      metadata.store_slug = sanitizedStore
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    const { data, error } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password: signupPassword,
      options: { data: metadata, emailRedirectTo: AUTH_CALLBACK_URL },
    });
    setLoading(false);
    if (error) {
      await logAuthEvent("signup_failure", { email: sanitizedEmail, success: false, metadata: { reason: error.message } });
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
      return;
    }

    // Detect repeated signup: Supabase returns 200 with an empty identities array
    // when the email is already registered (no new verification email is sent).
    const isRepeatedSignup =
      !!data.user && (data.user.identities?.length ?? 0) === 0;

    if (isRepeatedSignup) {
      await logAuthEvent("signup_failure", {
        email: sanitizedEmail,
        success: false,
        metadata: { reason: "email_already_registered" },
      });
      setSignupPanel({ kind: "repeated", email: sanitizedEmail });
      setResendCooldown(0);
      return;
    }

    await logAuthEvent("signup_success", { email: sanitizedEmail, metadata: { is_vendor: isVendorSignup } });
    // Fire welcome email (Brevo template 1) — fire-and-forget, no session needed.
    supabase.functions
      .invoke("send-transactional-email", {
        body: { type: "customer_welcome", email: sanitizedEmail, name: sanitizedName },
      })
      .catch((e) => console.warn("welcome email failed", e));
    setSignupPanel({ kind: "sent", email: sanitizedEmail });
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: getAuthCallbackUrl(),
    });
    if (result.error) {
      setLoading(false);
      toast({ title: "Google sign-in failed", description: String(result.error.message ?? result.error), variant: "destructive" });
      return;
    }
    if (result.redirected) return;
    setLoading(false);
    await routeAfterLogin();
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const e164 = toE164(countryCode, phone);
    if (!e164) {
      setErrors({ phone: "Enter a valid phone number" });
      return;
    }
    const rateCheck = checkRateLimit(`otp:${e164}`, RATE_LIMIT_RULES.otpSend);
    if (!rateCheck.allowed) {
      setErrors({ phone: `Too many requests. Try again in ${formatRetryTime(rateCheck.retryAfterMs)}.` });
      return;
    }
    setLoading(true);
    try {
      await sendOtp(e164);
      toast({ title: "Code sent", description: `We sent a 6-digit code to ${e164}` });
      navigate(`/auth/verify-otp?phone=${encodeURIComponent(e164)}`);
    } catch (err) {
      toast({
        title: "Couldn't send code",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="text-xs text-destructive mt-1">{errors[field]}</p> : null;

  return (
    <AuthShell title="Welcome to Koshur Kart" description="Sign in or create your account">
      <Button type="button" variant="outline" className="w-full gap-2" onClick={handleGoogle} disabled={loading}>
        <GoogleIcon /> Continue with Google
      </Button>
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="login">Sign In</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
          <TabsTrigger value="phone">Phone</TabsTrigger>
        </TabsList>

        <TabsContent value="login">
          <form onSubmit={handleLogin} className="space-y-4 mt-4">
            {rateLimitMsg && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {rateLimitMsg}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="login-email" type="email" placeholder="you@example.com" className="pl-10"
                  value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
              </div>
              <FieldError field="email" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Password</Label>
                <Link to="/auth/forgot-password" className="text-xs text-accent hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="login-password" type="password" placeholder="••••••••" className="pl-10"
                  value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
              </div>
              <FieldError field="password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !!rateLimitMsg}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup">
          {signupPanel?.kind === "sent" ? (
            <div className="space-y-4 mt-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <MailCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm">Check your inbox</h3>
                  <p className="text-sm text-muted-foreground">
                    We've sent a verification link to{" "}
                    <span className="font-medium text-foreground">{signupPanel.email}</span>.
                    Click the link to activate your account. Don't forget to check spam/promotions.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={resendCooldown > 0 || resending}
                onClick={() => handleResendVerification(signupPanel.email)}
              >
                {resending
                  ? "Resending..."
                  : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend verification email"}
              </Button>
              <button
                type="button"
                onClick={resetSignupPanel}
                className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : signupPanel?.kind === "repeated" ? (
            <div className="space-y-4 mt-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm">This email is already registered</h3>
                  <p className="text-sm text-muted-foreground">
                    An account with{" "}
                    <span className="font-medium text-foreground">{signupPanel.email}</span>{" "}
                    already exists. Sign in instead, reset your password, or resend the
                    verification email if you never confirmed it.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => switchToLoginWithEmail(signupPanel.email)}
                >
                  Sign In
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    navigate(`/auth/forgot-password?email=${encodeURIComponent(signupPanel.email)}`)
                  }
                >
                  Reset password
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={resendCooldown > 0 || resending}
                onClick={() => handleResendVerification(signupPanel.email)}
              >
                {resending
                  ? "Resending..."
                  : resendCooldown > 0
                  ? `Resend verification in ${resendCooldown}s`
                  : "Resend verification email"}
              </Button>
              <button
                type="button"
                onClick={resetSignupPanel}
                className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="signup-name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="signup-name" placeholder="John Doe" className="pl-10"
                  value={signupName} onChange={(e) => setSignupName(e.target.value)} required />
              </div>
              <FieldError field="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="signup-email" type="email" placeholder="you@example.com" className="pl-10"
                  value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
              </div>
              <FieldError field="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="signup-password" type="password" placeholder="At least 8 chars, mixed case + number" className="pl-10"
                  value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={8} />
              </div>

              <FieldError field="password" />
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 cursor-pointer"
              onClick={() => setIsVendorSignup(!isVendorSignup)}>
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm flex-1">I want to sell on Koshur Kart</span>
              <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${isVendorSignup ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                {isVendorSignup && <span className="text-primary-foreground text-xs">✓</span>}
              </div>
            </div>

            {isVendorSignup && (
              <div className="space-y-2">
                <Label htmlFor="store-name">Store Name</Label>
                <Input id="store-name" placeholder="My Awesome Store"
                  value={storeName} onChange={(e) => setStoreName(e.target.value)} required={isVendorSignup} />
                <FieldError field="storeName" />
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer"
                aria-describedby="terms-error"
              />
              <span className="text-sm text-muted-foreground leading-snug">
                I agree to the{" "}
                <Link to="/terms-and-conditions" target="_blank" rel="noopener" className="text-accent hover:underline font-medium">
                  Terms &amp; Conditions
                </Link>{" "}
                and Privacy Policy
              </span>
            </label>
            <div id="terms-error"><FieldError field="terms" /></div>

            <Button type="submit" className="w-full" disabled={loading || !agreedToTerms}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
            </form>
          )}
        </TabsContent>


        <TabsContent value="phone">
          <form onSubmit={handleSendOtp} className="space-y-4 mt-4">
            <PhoneInput
              countryCode={countryCode}
              onCountryChange={setCountryCode}
              phone={phone}
              onPhoneChange={setPhone}
              error={errors.phone}
              disabled={loading}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending code..." : "Send verification code"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </AuthShell>
  );
};

export default AuthPage;
