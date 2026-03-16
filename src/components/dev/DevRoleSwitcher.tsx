import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bug, X, LogIn, Shield, Store, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const TEST_ACCOUNTS = [
  { label: "Admin", icon: Shield, email: "admin@test.com", password: "test123456", color: "text-red-500" },
  { label: "Vendor", icon: Store, email: "vendor@test.com", password: "test123456", color: "text-blue-500" },
  { label: "User", icon: User, email: "user@test.com", password: "test123456", color: "text-green-500" },
];

const DevRoleSwitcher = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [promoEmail, setPromoEmail] = useState("");
  const { user, roles } = useAuth();

  if (!import.meta.env.DEV) return null;

  const quickLogin = async (email: string, password: string) => {
    setLoading(email);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(null);
    if (error) {
      toast.error(`Login failed: ${error.message}`);
    } else {
      toast.success(`Signed in as ${email}`);
      window.location.href = "/";
    }
  };

  const promoteAdmin = async () => {
    if (!promoEmail) return;
    const { error } = await supabase.rpc("promote_to_admin", { _email: promoEmail });
    if (error) {
      toast.error(`Promotion failed: ${error.message}`);
    } else {
      toast.success(`${promoEmail} promoted to admin!`);
      setPromoEmail("");
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="h-10 w-10 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg hover:bg-orange-600 transition-colors"
          title="Dev Tools"
        >
          <Bug className="h-5 w-5" />
        </button>
      ) : (
        <div className="w-72 rounded-xl border border-border bg-card shadow-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">🛠 Dev Switcher</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {user && (
            <div className="text-xs text-muted-foreground space-y-1 p-2 rounded-lg bg-muted/50">
              <div className="truncate">📧 {user.email}</div>
              <div>🎭 Roles: {roles.length > 0 ? roles.join(", ") : "none"}</div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Quick Login</span>
            {TEST_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                onClick={() => quickLogin(acc.email, acc.password)}
                disabled={loading === acc.email}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors text-left"
              >
                <acc.icon className={`h-4 w-4 ${acc.color}`} />
                <span className="flex-1 font-medium text-foreground">{acc.label}</span>
                <span className="text-xs text-muted-foreground">{acc.email}</span>
                {loading === acc.email && (
                  <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Promote to Admin</span>
            <div className="flex gap-1.5">
              <Input
                placeholder="email@test.com"
                value={promoEmail}
                onChange={(e) => setPromoEmail(e.target.value)}
                className="text-xs h-8"
              />
              <Button size="sm" variant="outline" onClick={promoteAdmin} className="h-8 px-2 shrink-0">
                <Shield className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              toast.info("Signed out");
            }}
            className="w-full text-xs text-center text-destructive hover:underline py-1"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default DevRoleSwitcher;
