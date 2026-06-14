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
    if (userRoles.includes("admin")) navigate("/admin", { replace: true });
    else if (userRoles.includes("vendor")) navigate("/vendor", { replace: true });
    else navigate("/", { replace: true });
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDescription =
          url.searchParams.get("error_description") ||
          new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
            "error_description",
          );

        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription));
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Hash-based flows: give Supabase a tick to pick up tokens from the URL hash.
          await new Promise((r) => setTimeout(r, 250));
        }

        const { data: sessionRes } = await supabase.auth.getSession();
        if (!sessionRes.session) {
          throw new Error(
            "We couldn't confirm your email. The link may have expired.",
          );
        }

        if (cancelled) return;
        setStatus("success");
        // Clean sensitive params from the URL bar
        window.history.replaceState({}, document.title, "/auth/callback");
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
        title="Email verified"
        description="Welcome to Koshur Kart"
        footer={
          <Link to="/" className="text-accent hover:underline">
            Continue to home
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-accent" />
          <p className="text-sm text-muted-foreground">
            Your email is confirmed. Taking you to your dashboard…
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
