import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Store, ShieldAlert } from "lucide-react";
import { loginSchema, signupSchema } from "@/lib/validators/securitySchema";
import { sanitizeEmail, sanitizeText } from "@/lib/sanitize";
import { checkRateLimit, RATE_LIMIT_RULES, formatRetryTime } from "@/lib/rateLimiter";

const AuthPage = () => {
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [isVendorSignup, setIsVendorSignup] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rateLimitMsg, setRateLimitMsg] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setRateLimitMsg("");

    const sanitizedEmail = sanitizeEmail(loginEmail);

    // Validate
    const result = loginSchema.safeParse({ email: sanitizedEmail, password: loginPassword });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Rate limit check
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
    } else {
      toast({ title: "Welcome back!" });
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "");
      const userRoles = rolesData?.map((r: any) => r.role) ?? [];
      if (userRoles.includes("admin")) {
        navigate("/admin");
      } else if (userRoles.includes("vendor")) {
        navigate("/vendor");
      } else {
        navigate("/");
      }
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const sanitizedName = sanitizeText(signupName);
    const sanitizedEmail = sanitizeEmail(signupEmail);
    const sanitizedStore = sanitizeText(storeName);

    // Validate
    const result = signupSchema.safeParse({
      name: sanitizedName,
      email: sanitizedEmail,
      password: signupPassword,
      storeName: isVendorSignup ? sanitizedStore : undefined,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
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
      metadata.store_slug = sanitizedStore.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    }

    const { error } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password: signupPassword,
      options: {
        data: metadata,
        emailRedirectTo: window.location.origin,
      },
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

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="text-xs text-destructive mt-1">{errors[field]}</p> : null;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md marketplace-shadow">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-2">
            <span className="text-primary-foreground font-bold text-lg">N</span>
          </div>
          <CardTitle className="text-2xl font-bold">Nexus Market</CardTitle>
          <CardDescription>Sign in or create your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
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
                      value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                  </div>
                  <FieldError field="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="login-password" type="password" placeholder="••••••••" className="pl-10"
                      value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
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
                      value={signupName} onChange={e => setSignupName(e.target.value)} required />
                  </div>
                  <FieldError field="name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-email" type="email" placeholder="you@example.com" className="pl-10"
                      value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
                  </div>
                  <FieldError field="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-password" type="password" placeholder="••••••••" className="pl-10"
                      value={signupPassword} onChange={e => setSignupPassword(e.target.value)} required minLength={6} />
                  </div>
                  <FieldError field="password" />
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 cursor-pointer"
                  onClick={() => setIsVendorSignup(!isVendorSignup)}>
                  <Store className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1">I want to sell on Nexus Market</span>
                  <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${isVendorSignup ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                    {isVendorSignup && <span className="text-primary-foreground text-xs">✓</span>}
                  </div>
                </div>

                {isVendorSignup && (
                  <div className="space-y-2">
                    <Label htmlFor="store-name">Store Name</Label>
                    <Input id="store-name" placeholder="My Awesome Store"
                      value={storeName} onChange={e => setStoreName(e.target.value)} required={isVendorSignup} />
                    <FieldError field="storeName" />
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;
