import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link, Outlet } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";

const VendorDashboard = () => {
  const { user, loading, isVendor, vendorId } = useAuth();

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (!isVendor) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-bold">Vendor Access Required</h2>
      <p className="text-muted-foreground">Sign up as a vendor to access this dashboard.</p>
      <Link to="/auth" className="text-primary underline">Go to Sign Up</Link>
    </div>
  );

  return (
    <DashboardLayout variant="vendor">
      <Outlet context={{ vendorId }} />
    </DashboardLayout>
  );
};

export default VendorDashboard;
