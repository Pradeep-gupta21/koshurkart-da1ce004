import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Store, ArrowRight } from "lucide-react";

const VendorApplyPage = () => {
  const { user, isVendor } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [description, setDescription] = useState("");

  if (isVendor) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <Store className="h-16 w-16 text-secondary" />
        <h1 className="text-2xl font-bold text-foreground">You're already a vendor!</h1>
        <Button onClick={() => navigate("/vendor")}>Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
    );
  }

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const storeSlug = storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const { error } = await supabase.rpc("vendor_apply", {
      _store_name: storeName,
      _store_slug: storeSlug,
      _description: description,
    });

    setLoading(false);
    if (error) {
      toast({ title: "Application failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Application submitted!", description: "Next: complete your KYC to speed up approval." });
    // Full reload so AuthProvider picks up the new vendor row + role.
    window.location.href = "/vendor/apply/kyc";
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-secondary flex items-center justify-center mb-2">
            <Store className="h-6 w-6 text-secondary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Become a Vendor</CardTitle>
          <CardDescription>Apply to start selling on Nexus Market</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApply} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Store Name</Label>
              <Input
                id="store-name"
                placeholder="My Awesome Store"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                minLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Store Description</Label>
              <Textarea
                id="description"
                placeholder="Tell us about your store and what you plan to sell..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorApplyPage;
