import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Package, Megaphone, BarChart3, Wallet, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/vendor", icon: LayoutDashboard, label: "Overview", exact: true },
  { to: "/vendor/products", icon: Package, label: "Products" },
  { to: "/vendor/orders", icon: ShoppingBag, label: "Orders" },
  { to: "/vendor/campaigns", icon: Megaphone, label: "Ad Campaigns" },
  { to: "/vendor/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/vendor/payments", icon: Wallet, label: "Payments" },
];

const VendorDashboard = () => {
  const { user, loading, isVendor, vendorId } = useAuth();
  const location = useLocation();

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isVendor) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-bold">Vendor Access Required</h2>
      <p className="text-muted-foreground">Sign up as a vendor to access this dashboard.</p>
      <Link to="/auth" className="text-primary underline">Go to Sign Up</Link>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-12rem)]">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-sidebar-background hidden lg:block">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg text-sidebar-foreground">Vendor Panel</h2>
          <p className="text-xs text-muted-foreground mt-1">Manage your store</p>
        </div>
        <nav className="p-2 space-y-1">
          {navItems.map(item => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t flex justify-around py-2">
        {navItems.map(item => {
          const active = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <Link key={item.to} to={item.to}
              className={cn("flex flex-col items-center gap-1 text-[10px] p-1", active ? "text-primary" : "text-muted-foreground")}>
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Outlet context={{ vendorId }} />
      </div>
    </div>
  );
};

export default VendorDashboard;
