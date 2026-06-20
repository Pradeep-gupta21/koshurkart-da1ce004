import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import AuthShell from "@/components/auth/AuthShell";

type Status = "verifying" | "success" | "error";

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const routeAuthenticatedUser = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) return navigate("/auth", { replace: true });

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const userRoles = rolesData?.map((r: { role: string }) => r.role) ?? [];

    // Customer flow only — vendors/admins are blocked above before reaching here.
    if (userRoles.includes("admin")) {
      navigate("/admin", { replace: true });
    } else if (userRoles.includes("vendor")) {
      navigate("/vendor", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  };

  /**
   * For OAuth (Google) flows only: block vendors and admins from completing
   * sign-in. Google auth is reserved for buyer/customer accounts.
   * Returns true when the user was blocked (caller should stop).
   */
  const enforceBuyerOnlyOAuth = async (isOAuth: boolean): Promise<boolean> => {
    if (!isOAuth) return false;
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) return false;

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const userRoles = rolesData?.map((r: { role: string }) => r.role) ?? [];

    if (userRoles.includes("vendor") || userRoles.includes("admin")) {
      await supabase.auth.signOut({ scope: "global" });
      try {
        // Best-effort cleanup of any stale auth tokens.
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") && k.includes("-auth-token"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* noop */
      }
      navigate("/auth?error=oauth_vendor_restricted", { replace: true });
      return true;
    }
    return false;
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash =
          url.searchParams.get("token_hash") || url.searchParams.get("token");
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, ""),
        );
        const flowType = url.searchParams.get("type") || hashParams.get("type");
        const errorDescription =
          url.searchParams.get("error_description") ||
          hashParams.get("error_description");

        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription));
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && flowType) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: flowType as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
          });
          if (error) throw error;
        } else if (hashParams.get("access_token")) {
          // Hash-based token flow: supabase-js picks tokens up from the URL hash
          // when detectSessionInUrl is enabled. Give it a tick to persist.
          await new Promise((r) => setTimeout(r, 300));
        }

        // Validate with the auth server, not just local storage.
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes.user) {
          throw new Error(
            "We couldn't confirm your email. The link may have expired or already been used.",
          );
        }

        if (cancelled) return;
        if (flowType === "recovery") {
          window.history.replaceState({}, document.title, "/auth/reset-password");
          navigate("/auth/reset-password", { replace: true });
          return;
        }

        // Strip sensitive params from the URL bar.
        window.history.replaceState({}, document.title, "/auth/callback");
        setStatus("success");
        setTimeout(() => {
          if (!cancelled) routeAuthenticatedUser();
        }, 2000);
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "We couldn't verify your email. Please try again.",
        );
        setStatus("error");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "verifying") {
    return (
      <AuthShell
        title="Verifying your email"
        description="Hang tight while we confirm your account"
      >
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="h-10 w-10 text-accent animate-spin" />
          <p className="text-sm text-muted-foreground">
            This only takes a moment.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (status === "success") {
    return (
      <AuthShell
        title="Email Verified Successfully"
        description="Welcome to Koshur Kart"
        footer={
          <Link to="/" className="text-accent hover:underline">
            Continue to Koshur Kart
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-accent" />
          <p className="text-sm text-muted-foreground">
            Your email is confirmed and you're signed in. Taking you to your
            dashboard…
          </p>
          <Button className="w-full" onClick={routeAuthenticatedUser}>
            Continue
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Verification failed"
      description="We couldn't verify your email"
      footer={
        <Link to="/auth" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <Button asChild className="w-full">
          <Link to="/auth">Return to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
};

export default AuthCallbackPage;
