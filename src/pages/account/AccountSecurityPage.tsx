import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, LogOut, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AuthEvent {
  id: string;
  event_type: string;
  success: boolean;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const friendlyEvent = (t: string) => {
  switch (t) {
    case "login_success": return "Signed in";
    case "login_failure": return "Failed sign-in";
    case "signup_success": return "Account created";
    case "signup_failure": return "Failed signup";
    case "signout": return "Signed out";
    case "password_reset_request": return "Password reset requested";
    case "password_reset_complete": return "Password changed";
    case "otp_send": return "Verification code sent";
    case "otp_verify_success": return "Phone verified";
    case "otp_verify_failure": return "Phone verification failed";
    case "session_revoke": return "Session revoked";
    default: return t.replace(/_/g, " ");
  }
};

const AccountSecurityPage = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("auth_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (!active) return;
      if (error) {
        toast({ title: "Couldn't load activity", description: error.message, variant: "destructive" });
      } else {
        setEvents((data ?? []) as AuthEvent[]);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user, toast]);

  const handleSignOutAll = async () => {
    setRevoking(true);
    await signOut("global");
    setRevoking(false);
    toast({ title: "Signed out from all devices" });
  };

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account security</h1>
          <p className="text-sm text-muted-foreground">Review recent activity and manage your active sessions.</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
          <CardDescription>
            Signed in as <span className="font-medium text-foreground">{user.email}</span>. To revoke
            access on every device — including this one — sign out everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={handleSignOutAll}
            disabled={revoking}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            {revoking ? "Signing out..." : "Sign out everywhere"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>The last 30 security events on your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((ev) => (
                <li key={ev.id} className="py-3 flex items-start gap-3">
                  {ev.success ? (
                    <CheckCircle2 className="h-4 w-4 mt-1 text-accent shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mt-1 text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{friendlyEvent(ev.event_type)}</span>
                      {!ev.success && <Badge variant="destructive" className="text-[10px]">failed</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {ev.ip ? `${ev.ip} • ` : ""}
                      {ev.user_agent?.slice(0, 80) ?? "Unknown device"}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountSecurityPage;
