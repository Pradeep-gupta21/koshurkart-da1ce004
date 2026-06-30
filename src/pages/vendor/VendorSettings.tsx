import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { vendorService } from "@/services/vendorService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Upload } from "lucide-react";
import ShippingServiceabilityCard from "@/components/vendor/ShippingServiceabilityCard";

const KYC_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  verified: "default",
  pending: "secondary",
  rejected: "destructive",
  not_submitted: "outline",
};

const KYC_LABEL: Record<string, string> = {
  approved: "verified",
  verified: "verified",
  pending: "pending",
  rejected: "rejected",
  not_submitted: "not submitted",
};

const VendorSettings = () => {
  const { vendorId, kycStatus, refreshVendor } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Influencer (commission-exempt) direct UPI checkout configuration.
  const [isExempt, setIsExempt] = useState(false);
  const [directUpiId, setDirectUpiId] = useState("");
  const [directUpiQrUrl, setDirectUpiQrUrl] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [savingDirect, setSavingDirect] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    (async () => {
      const v = await vendorService.getById(vendorId);
      setStoreName(v.store_name);
      setDescription(v.description ?? "");
      setLogo(v.logo ?? null);
      // Fetch the influencer-checkout fields directly (vendorService.getById may not surface them).
      const { data: directRow } = await supabase
        .from("vendors")
        .select("is_commission_exempt, direct_upi_id, direct_upi_qr_url")
        .eq("id", vendorId)
        .maybeSingle();
      if (directRow) {
        setIsExempt(!!directRow.is_commission_exempt);
        setDirectUpiId(directRow.direct_upi_id ?? "");
        setDirectUpiQrUrl(directRow.direct_upi_qr_url ?? null);
      }
      setLoading(false);
    })();
    // Live KYC status updates from admin actions
    refreshVendor();
    const channel = supabase
      .channel(`vendor-kyc-${vendorId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vendors", filter: `id=eq.${vendorId}` },
        () => { refreshVendor(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [vendorId]);


  const handleSave = async () => {
    if (!vendorId) {
      toast({ title: "Not signed in", description: "Your vendor session is missing. Please sign in again.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let logoUrl: string | undefined = logo ?? undefined;
      if (logoFile) {
        console.log('[VendorSettings] uploading logo', { name: logoFile.name, size: logoFile.size });
        logoUrl = await vendorService.uploadLogo(vendorId, logoFile);
        console.log('[VendorSettings] logo uploaded', logoUrl);
      }
      // Only string URLs reach the DB — never the raw File object.
      await vendorService.update(vendorId, {
        store_name: storeName.trim(),
        description: description.trim(),
        logo: logoUrl,
      });
      await refreshVendor();
      setLogo(logoUrl ?? null);
      setLogoFile(null);
      toast({ title: "Store updated" });
    } catch (e: any) {
      console.error('[VendorSettings] save failed', e);
      toast({
        title: "Save failed",
        description: e?.message || e?.error_description || "Unknown error — check console for details.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Save the influencer/exempt vendor's personal UPI checkout block.
  const handleSaveDirectUpi = async () => {
    if (!vendorId) return;
    const trimmedUpi = directUpiId.trim();
    // Basic UPI VPA format: handle@provider
    if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(trimmedUpi)) {
      toast({ title: "Invalid UPI ID", description: "Use the format name@bank (e.g. yourname@okaxis).", variant: "destructive" });
      return;
    }
    setSavingDirect(true);
    try {
      let qrUrl: string | null = directUpiQrUrl;
      if (qrFile) {
        // Reuse uploadLogo's bucket/path conventions so storage RLS passes.
        qrUrl = await vendorService.uploadLogo(vendorId, qrFile);
      }
      if (!qrUrl) {
        toast({ title: "QR code required", description: "Upload your personal UPI payment QR image to continue.", variant: "destructive" });
        setSavingDirect(false);
        return;
      }
      const { error } = await supabase
        .from("vendors")
        .update({ direct_upi_id: trimmedUpi, direct_upi_qr_url: qrUrl })
        .eq("id", vendorId);
      if (error) throw error;
      setDirectUpiId(trimmedUpi);
      setDirectUpiQrUrl(qrUrl);
      setQrFile(null);
      toast({ title: "Direct UPI checkout updated" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Could not save UPI details.", variant: "destructive" });
    } finally {
      setSavingDirect(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const previewLogo = logoFile ? URL.createObjectURL(logoFile) : logo;
  const ks = kycStatus ?? "not_submitted";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Store Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your storefront details and KYC status.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Store Profile</CardTitle>
          <CardDescription>Visible to customers across the marketplace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={previewLogo ?? undefined} alt={storeName} />
              <AvatarFallback>{storeName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Label htmlFor="logo" className="cursor-pointer">
                <div className="inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm hover:bg-accent">
                  <Upload className="h-4 w-4" /> Change logo
                </div>
                <Input id="logo" type="file" accept="image/*" className="hidden"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
              </Label>
              <p className="text-xs text-muted-foreground mt-1">PNG/JPG, square preferred.</p>
            </div>
          </div>
          <div>
            <Label>Store Name</Label>
            <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <ShippingServiceabilityCard vendorId={vendorId} />


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            KYC Status <Badge variant={KYC_BADGE[ks] ?? "outline"}>{KYC_LABEL[ks] ?? ks.replace("_", " ")}</Badge>
          </CardTitle>
          <CardDescription>
            {ks === "approved" && "Your KYC is verified."}
            {ks === "pending" && "Your KYC is under review."}
            {ks === "rejected" && "Your KYC needs corrections. Please resubmit."}
            {ks === "not_submitted" && "Submit KYC to activate your store."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(ks === "not_submitted" || ks === "rejected") && (
            <Button asChild><Link to="/vendor/apply/kyc">{ks === "rejected" ? "Resubmit KYC" : "Complete KYC"}</Link></Button>
          )}
          <div>
            <Button variant="outline" asChild>
              <Link to="/vendor/apply/kyc">Update KYC &amp; Bank Details</Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Edit your previously saved business, bank, and checkout display preference. Resubmission will return your KYC to pending review.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorSettings;
