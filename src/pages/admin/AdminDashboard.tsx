import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Users, ShieldCheck, Megaphone, Wallet } from "lucide-react";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/admin/vendors", icon: Users, label: "Vendor Approvals" },
  { to: "/admin/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/admin/payouts", icon: Wallet, label: "Payouts" },
];

const AdminDashboard = () => {
  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      <aside className="w-56 border-r border-border bg-sidebar-background p-4 space-y-1 hidden md:block">
        <div className="flex items-center gap-2 px-3 py-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">Admin Panel</span>
        </div>
        {navItems.map(({ to, icon: Icon, label, end }) => (
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
