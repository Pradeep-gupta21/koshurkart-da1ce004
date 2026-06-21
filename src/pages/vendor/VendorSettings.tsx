import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { vendorService } from "@/services/vendorService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Upload } from "lucide-react";

const KYC_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  pending: "secondary",
  rejected: "destructive",
  not_submitted: "outline",
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

  useEffect(() => {
    if (!vendorId) return;
    vendorService.getById(vendorId).then((v) => {
      setStoreName(v.store_name);
      setDescription(v.description ?? "");
      setLogo(v.logo ?? null);
      setLoading(false);
    });
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            KYC Status <Badge variant={KYC_BADGE[ks] ?? "outline"}>{ks.replace("_", " ")}</Badge>
          </CardTitle>
          <CardDescription>
            {ks === "approved" && "Your KYC is verified."}
            {ks === "pending" && "Your KYC is under review."}
            {ks === "rejected" && "Your KYC needs corrections. Please resubmit."}
            {ks === "not_submitted" && "Submit KYC to activate your store."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(ks === "not_submitted" || ks === "rejected") && (
            <Button asChild><Link to="/vendor/apply/kyc">{ks === "rejected" ? "Resubmit KYC" : "Complete KYC"}</Link></Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorSettings;
