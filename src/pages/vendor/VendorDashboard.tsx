import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link, Outlet, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const VendorDashboard = () => {
  const { user, loading, isVendor, vendorId } = useAuth();
  const navigate = useNavigate();

  // Payment setup status
  const [paymentSetupLoading, setPaymentSetupLoading] = useState(true);
  const [paymentSetupCompleted, setPaymentSetupCompleted] = useState(false);
  const [paymentDestLabel, setPaymentDestLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from("vendors")
          .select("payment_setup_completed")
          .eq("id", vendorId)
          .single();

        if (cancelled) return;
        const done = data?.payment_setup_completed ?? false;
        setPaymentSetupCompleted(done);

        if (done) {
          // Fetch payment destination type for display (safe fields only)
          const { data: setup } = await supabase
            .from("vendor_payment_setup")
            .select("payment_destination_type")
            .eq("vendor_id", vendorId)
            .maybeSingle();

          if (!cancelled && setup) {
            const type = setup.payment_destination_type;
            if (type === "ifsc_account") setPaymentDestLabel("Bank Transfer (****…****)");
            else if (type === "upi_id") setPaymentDestLabel("UPI (***@****)");
            else if (type === "both") setPaymentDestLabel("Bank Transfer + UPI");
          }
        }
      } catch {
        // Non-critical — banner will just not show destination detail
      } finally {
        if (!cancelled) setPaymentSetupLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [vendorId]);

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
      {/* Payment Setup Banner */}
      {paymentSetupLoading ? (
        <div className="mb-4">
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : !paymentSetupCompleted ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              ⚠️ Payment Setup Incomplete
            </p>
            <p className="text-xs text-muted-foreground">
              You must complete your payment setup before you can publish products or receive orders.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/vendor/payment-setup")}
          >
            Complete Payment Setup
          </Button>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              ✓ Payment Setup Complete
            </p>
            {paymentDestLabel && (
              <p className="text-xs text-muted-foreground">{paymentDestLabel}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/vendor/payment-setup")}
          >
            Edit Payment Setup
          </Button>
        </div>
      )}

      <Outlet context={{ vendorId }} />
    </DashboardLayout>
  );
};

export default VendorDashboard;
