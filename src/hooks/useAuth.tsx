import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorStatus, setVendorStatus] = useState<VendorStatus>(null);
  const [kycStatus, setKycStatus] = useState<KYCStatus>(null);

  const fetchVendor = async (userId: string) => {
    const { data } = await supabase
      .from("vendors")
      .select("id, verification_status, kyc_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      setVendorId(data.id);
      setVendorStatus((data.verification_status as VendorStatus) ?? null);
      setKycStatus((data.kyc_status as KYCStatus) ?? null);
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => {
          fetchRoles(session.user.id);
          fetchVendor(session.user.id);
        }, 0);
      } else {
        setRoles([]);
        setVendorId(null);
        setVendorStatus(null);
        setKycStatus(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoles(session.user.id);
        fetchVendor(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshVendor = async () => {
    if (user) await fetchVendor(user.id);
  };

  const signOut = async (scope: "local" | "global" = "global") => {
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
