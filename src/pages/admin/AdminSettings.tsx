import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Info, DollarSign, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { platformSettings } from "@/config/platformSettings";

const AdminSettings = () => {
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPercentage, setCommissionPercentage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("platform_settings" as any)
      .select("value")
      .eq("key", "commission")
      .single()
      .then(({ data, error }: any) => {
        if (!error && data?.value) {
          setCommissionEnabled(data.value.enabled ?? false);
          setCommissionPercentage(data.value.percentage ?? 0);
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await (supabase
      .from("platform_settings" as any)
      .update({
        value: { enabled: commissionEnabled, percentage: commissionPercentage },
        updated_at: new Date().toISOString(),
      } as any)
      .eq("key", "commission") as any);

    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Commission settings saved");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>
        <p className="text-muted-foreground">Configure platform-wide settings and monetization.</p>
      </div>

      {/* Commission Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>Commission Configuration</CardTitle>
          </div>
          <CardDescription>
            Control the platform commission deducted from vendor payments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Enable Commission</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, the platform deducts a percentage from each successful payment.
              </p>
            </div>
            <Switch
              checked={commissionEnabled}
              onCheckedChange={setCommissionEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="commission-pct">Commission Percentage</Label>
            <div className="flex items-center gap-3">
              <Input
                id="commission-pct"
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={commissionPercentage}
                onChange={(e) => setCommissionPercentage(Number(e.target.value))}
                className="w-32"
                disabled={!commissionEnabled}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Value between 0 and 50. Vendors receive {commissionEnabled ? (100 - commissionPercentage) : 100}% of each payment.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-4">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              When enabled, the platform will deduct the configured percentage from each payment as commission. Vendors will receive the remaining amount. Changes apply to new payments immediately.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant={commissionEnabled ? "default" : "secondary"}>
              {commissionEnabled ? `${commissionPercentage}% Active` : "Commission Disabled"}
            </Badge>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Commission Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* UPI Configuration (read-only for now) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            <CardTitle>UPI Configuration</CardTitle>
          </div>
          <CardDescription>Merchant UPI ID used for payment QR codes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              value={platformSettings.merchantUpiId}
              disabled
              className="w-64"
            />
            <Badge variant="outline">Read-only</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Update the merchant UPI ID in the platform configuration file.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
