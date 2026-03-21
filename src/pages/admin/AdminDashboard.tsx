import { useEffect, useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { ShieldAlert as ShieldAlertIcon } from "lucide-react";
import { LayoutDashboard, Users, ShieldCheck, Megaphone, Wallet, LayoutGrid, MessageSquare, DollarSign, ShieldAlert, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/admin/vendors", icon: Users, label: "Vendors" },
  { to: "/admin/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/admin/placements", icon: LayoutGrid, label: "Ad Pricing" },
  { to: "/admin/payouts", icon: Wallet, label: "Payouts" },
  { to: "/admin/reviews", icon: MessageSquare, label: "Reviews", hasBadge: true },
  { to: "/admin/pricing", icon: DollarSign, label: "Dynamic Pricing" },
  { to: "/admin/payments", icon: CreditCard, label: "Payments", hasPaymentBadge: true },
  { to: "/admin/security", icon: ShieldAlert, label: "Security" },
];

const AdminDashboard = () => {
  const [suspiciousCount, setSuspiciousCount] = useState(0);
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0);

  useEffect(() => {
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("is_suspicious", true)
      .eq("moderation_status", "pending")
      .then(({ count }) => setSuspiciousCount(count ?? 0));

    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "pending_verification")
      .then(({ count }) => setPendingPaymentCount(count ?? 0));
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      <aside className="w-56 border-r border-border bg-sidebar-background p-4 space-y-1 hidden md:block">
        <div className="flex items-center gap-2 px-3 py-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Admin Panel</span>
        </div>
        {navItems.map(({ to, icon: Icon, label, end, hasBadge, hasPaymentBadge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            {hasBadge && suspiciousCount > 0 && (
              <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1.5 text-xs">
                {suspiciousCount}
              </Badge>
            )}
            {hasPaymentBadge && pendingPaymentCount > 0 && (
              <Badge variant="secondary" className="ml-auto h-5 min-w-[20px] px-1.5 text-xs">
                {pendingPaymentCount}
              </Badge>
            )}
          </NavLink>
        ))}
      </aside>
      <div className="flex-1 p-6">
        <Outlet />
      </div>
    </div>
  );
};

export default AdminDashboard;
