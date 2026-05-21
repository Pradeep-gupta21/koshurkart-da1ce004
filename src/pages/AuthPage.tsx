import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Store, ShieldAlert, Phone } from "lucide-react";
import { loginSchema, signupSchema } from "@/lib/validators/securitySchema";
import { sanitizeEmail, sanitizeText } from "@/lib/sanitize";
import { checkRateLimit, RATE_LIMIT_RULES, formatRetryTime } from "@/lib/rateLimiter";
import AuthShell from "@/components/auth/AuthShell";

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

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
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rateLimitMsg, setRateLimitMsg] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

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
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Welcome back!" });
    await routeAfterLogin();
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

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
    const metadata: Record<string, string> = { name: sanitizedName };
    if (isVendorSignup && sanitizedStore) {
      metadata.store_name = sanitizedStore;
      metadata.store_slug = sanitizedStore
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    const { error } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password: signupPassword,
      options: { data: metadata, emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Account created!",
      description: "Please check your email to verify your account.",
    });
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
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
    const cleaned = phone.trim().replace(/\s+/g, "");
    if (!/^\+?[1-9]\d{9,14}$/.test(cleaned)) {
      setErrors({ phone: "Enter a valid phone number with country code (e.g. +919876543210)" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: cleaned });
    setLoading(false);
    if (error) {
      toast({ title: "Couldn't send code", description: error.message, variant: "destructive" });
      return;
    }
    setOtpSent(true);
    toast({ title: "Code sent", description: `We sent a 6-digit code to ${cleaned}` });
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setErrors({ otp: "Enter the 6-digit code" });
      return;
    }
    setLoading(true);
    const cleaned = phone.trim().replace(/\s+/g, "");
    const { error } = await supabase.auth.verifyOtp({ phone: cleaned, token: otp, type: "sms" });
    setLoading(false);
    if (error) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Signed in" });
    await routeAfterLogin();
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

      <Tabs defaultValue="login">
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
                <Input id="signup-password" type="password" placeholder="At least 6 characters" className="pl-10"
                  value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={6} />
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

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="phone">
          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="phone" type="tel" placeholder="+91 98765 43210" className="pl-10"
                    value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <FieldError field="phone" />
                <p className="text-xs text-muted-foreground">Include your country code (e.g. +91 for India).</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending code..." : "Send code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4 mt-4">
              <div className="space-y-2 text-center">
                <Label>Enter the 6-digit code</Label>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <FieldError field="otp" />
                <button type="button" className="text-xs text-accent hover:underline" onClick={() => { setOtpSent(false); setOtp(""); }}>
                  Use a different number
                </button>
              </div>
              <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                {loading ? "Verifying..." : "Verify & Sign In"}
              </Button>
            </form>
          )}
        </TabsContent>
      </Tabs>
    </AuthShell>
  );
};

export default AuthPage;
