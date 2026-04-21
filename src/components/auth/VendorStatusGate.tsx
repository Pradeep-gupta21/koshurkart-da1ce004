import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, FileText, Pause, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: React.ReactNode;
}

/**
 * Gates the vendor dashboard based on `vendors.verification_status`.
 * Renders the dashboard only when verified/approved. Otherwise shows
 * a contextual screen (pending review, rejected, suspended).
 */
const VendorStatusGate = ({ children }: Props) => {
  const { vendorId, vendorStatus, kycStatus, loading } = useAuth();
  const location = useLocation();
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  // Pull rejection reason if needed (separate query — small payload)
  useEffect(() => {
    if (!vendorId || (vendorStatus !== "rejected" && vendorStatus !== "suspended")) return;
    supabase
      .from("vendors")
      .select("verification_rejection_reason, kyc_rejection_reason")
      .eq("id", vendorId)
      .single()
      .then(({ data }) =>
        setRejectionReason(data?.verification_rejection_reason ?? data?.kyc_rejection_reason ?? null),
      );
  }, [vendorId, vendorStatus]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No vendor row yet — push to apply flow
  if (!vendorId) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Become a Vendor</CardTitle>
            <CardDescription>You need to apply before you can access the vendor dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full"><Link to="/vendor/apply">Apply Now</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verified/approved → render dashboard
  if (vendorStatus === "verified" || vendorStatus === "approved") {
    return <>{children}</>;
  }

  if (vendorStatus === "suspended") {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full border-destructive/40">
          <CardHeader className="items-center text-center">
            <Pause className="h-12 w-12 text-destructive mb-2" />
            <CardTitle>Account Suspended</CardTitle>
            <CardDescription>
              {rejectionReason
                ? `Reason: ${rejectionReason}`
                : "Your vendor account has been suspended. Please contact support to resolve this."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <a href="mailto:support@example.com">Contact Support</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (vendorStatus === "rejected") {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="items-center text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mb-2" />
            <CardTitle>Application Rejected</CardTitle>
            <CardDescription>
              {rejectionReason
                ? `Reason: ${rejectionReason}`
                : "Your vendor application was not approved. You can update your details and reapply."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full">
              <Link to="/vendor/apply/kyc">Update KYC & Reapply</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // pending (default)
  const kycComplete = kycStatus && kycStatus !== "not_submitted";
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="items-center text-center">
          <Clock className="h-12 w-12 text-primary mb-2" />
          <CardTitle>Application Under Review</CardTitle>
          <CardDescription>
            We're reviewing your store application. You'll be notified by email and in-app once it's approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {kycComplete ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertCircle className="h-4 w-4 text-accent" />
              )}
              <span className="flex-1">KYC submission</span>
              <Badge variant={kycComplete ? "default" : "secondary"}>
                {kycStatus === "approved" ? "Verified" : kycStatus === "pending" ? "Pending review" : kycStatus === "rejected" ? "Needs attention" : "Not started"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">Final admin approval</span>
              <Badge variant="outline">Waiting</Badge>
            </div>
          </div>

          {(!kycComplete || kycStatus === "rejected") && (
            <Button asChild className="w-full">
              <Link to="/vendor/apply/kyc">
                <FileText className="h-4 w-4 mr-2" />
                {kycStatus === "rejected" ? "Resubmit KYC" : "Complete KYC"}
              </Link>
            </Button>
          )}
          {location.pathname !== "/" && (
            <Button asChild variant="ghost" className="w-full"><Link to="/">Back to store</Link></Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorStatusGate;
