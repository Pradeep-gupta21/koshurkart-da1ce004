import { useState, useEffect, createContext, useContext, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { logAuthEvent } from "@/lib/authLog";

export type VendorStatus = "pending" | "approved" | "verified" | "rejected" | "suspended" | null;
export type KYCStatus = "not_submitted" | "pending" | "approved" | "rejected" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: string[];
  isVendor: boolean;
  isAdmin: boolean;
  vendorId: string | null;
  vendorStatus: VendorStatus;
  kycStatus: KYCStatus;
  refreshVendor: () => Promise<void>;
  signOut: (scope?: "local" | "global") => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 30-minute idle timeout (configurable via env if needed)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorStatus, setVendorStatus] = useState<VendorStatus>(null);
  const [kycStatus, setKycStatus] = useState<KYCStatus>(null);
  const idleTimer = useRef<number | null>(null);
  const userRef = useRef<User | null>(null);

  const fetchVendor = async (_userId: string) => {
    const { data } = await supabase.rpc('get_my_vendor');
    const row = data?.[0];
    if (row) {
      setVendorId(row.id);
      setVendorStatus((row.verification_status as VendorStatus) ?? null);
      setKycStatus((row.kyc_status as KYCStatus) ?? null);
    } else {
      setVendorId(null);
      setVendorStatus(null);
      setKycStatus(null);
    }
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (data) setRoles(data.map((r: any) => r.role));
  };

  const resetIdleTimer = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(async () => {
      if (userRef.current) {
        await logAuthEvent("signout", { metadata: { reason: "idle_timeout" } });
        await supabase.auth.signOut({ scope: "local" });
      }
    }, IDLE_TIMEOUT_MS);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      userRef.current = newSession?.user ?? null;
      if (newSession?.user) {
        setTimeout(() => {
          fetchRoles(newSession.user.id);
          fetchVendor(newSession.user.id);
        }, 0);
        resetIdleTimer();
      } else {
        setRoles([]);
        setVendorId(null);
        setVendorStatus(null);
        setKycStatus(null);
        if (idleTimer.current) window.clearTimeout(idleTimer.current);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      userRef.current = existing?.user ?? null;
      if (existing?.user) {
        fetchRoles(existing.user.id);
        fetchVendor(existing.user.id);
        resetIdleTimer();
      }
      setLoading(false);
    });

    // Activity listeners reset idle timer
    const activityEvents: (keyof WindowEventMap)[] = ["mousedown", "keydown", "scroll", "touchstart"];
    const onActivity = () => {
      if (userRef.current) resetIdleTimer();
    };
    activityEvents.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    return () => {
      subscription.unsubscribe();
      activityEvents.forEach((e) => window.removeEventListener(e, onActivity));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  const refreshVendor = async () => {
    if (user) await fetchVendor(user.id);
  };

  const signOut = async (scope: "local" | "global" = "global") => {
    await logAuthEvent("signout", { metadata: { scope } });
    await supabase.auth.signOut({ scope });
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading, roles,
      isVendor: roles.includes("vendor"),
      isAdmin: roles.includes("admin"),
      vendorId, vendorStatus, kycStatus,
      refreshVendor, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
