import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import { resetPasswordSchema } from "@/lib/validators/securitySchema";
import { logAuthEvent } from "@/lib/authLog";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else if (!window.location.hash.includes("type=recovery")) {
        setError("This reset link is invalid or has expired. Request a new one.");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords don't match");
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      return setError(parsed.error.issues[0]?.message ?? "Invalid password");
    }
    setError(null);
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    await logAuthEvent("password_reset_complete", { success: !updateErr });
    if (updateErr) {
      toast({ title: "Couldn't update password", description: updateErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Password updated", description: "You're now signed in." });
    navigate("/");
  };

  return (
    <AuthShell title="Reset your password" description="Choose a new password for your account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="new-password" type="password" placeholder="8+ chars, mixed case + number" className="pl-10"
              value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} disabled={!ready} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="confirm-password" type="password" placeholder="Repeat password" className="pl-10"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} disabled={!ready} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || !ready}>
          {loading ? "Updating..." : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
};

export default ResetPasswordPage;
