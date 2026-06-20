import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, IndianRupee, QrCode, CreditCard, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PaymentSettings {
  razorpayEnabled: boolean;
  upiEnabled: boolean;
  merchantUpiId: string;
  merchantName: string;
}

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  razorpayEnabled: true,
  upiEnabled: true,
  merchantUpiId: "merchant@upi",
  merchantName: "KoshurKart",
};

const AdminSettings = () => {
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPercentage, setCommissionPercentage] = useState(0);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase
        .from("platform_settings" as any)
        .select("key, value")
        .in("key", ["commission", "payment_methods"]) as any,
    ]).then(([{ data }]: any) => {
      if (data) {
        for (const row of data) {
          if (row.key === "commission" && row.value) {
            setCommissionEnabled(row.value.enabled ?? false);
            setCommissionPercentage(row.value.percentage ?? 0);
          }
          if (row.key === "payment_methods" && row.value) {
            setPaymentSettings({
              razorpayEnabled: row.value.razorpayEnabled ?? true,
              upiEnabled: row.value.upiEnabled ?? true,
              merchantUpiId: row.value.merchantUpiId ?? "merchant@upi",
              merchantName: row.value.merchantName ?? "KoshurKart",
            });
          }
        }
      }
      setLoading(false);
    });
  }, []);

  const handleSaveCommission = async () => {
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

  const handleSavePayment = async () => {
    setSavingPayment(true);

    // Upsert: try update first, insert if not found
    const value = {
      razorpayEnabled: paymentSettings.razorpayEnabled,
      upiEnabled: paymentSettings.upiEnabled,
      merchantUpiId: paymentSettings.merchantUpiId,
      merchantName: paymentSettings.merchantName,
    };

    const { data: existing } = await (supabase
      .from("platform_settings" as any)
      .select("id")
      .eq("key", "payment_methods")
      .maybeSingle() as any);

    let error: any;
    if (existing) {
      ({ error } = await (supabase
        .from("platform_settings" as any)
        .update({ value, updated_at: new Date().toISOString() } as any)
        .eq("key", "payment_methods") as any));
    } else {
      ({ error } = await (supabase
        .from("platform_settings" as any)
        .insert({ key: "payment_methods", value } as any) as any));
    }

    if (error) {
      toast.error("Failed to save payment settings");
    } else {
      toast.success("Payment settings saved");
    }
    setSavingPayment(false);
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
        <p className="text-muted-foreground">Configure platform-wide settings, payments, and monetization.</p>
      </div>

      {/* Payment Method Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Payment Methods</CardTitle>
          </div>
          <CardDescription>
            Enable or disable payment gateways and configure merchant details. Cash on Delivery is always available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Razorpay Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Razorpay Gateway</Label>
              <p className="text-sm text-muted-foreground">
                Accept payments via cards, UPI, net banking and wallets through Razorpay.
              </p>
            </div>
            <Switch
              checked={paymentSettings.razorpayEnabled}
              onCheckedChange={(v) => setPaymentSettings((s) => ({ ...s, razorpayEnabled: v }))}
            />
          </div>

          {/* UPI Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Manual UPI (QR Code)</Label>
              <p className="text-sm text-muted-foreground">
                Show a QR code for customers to pay directly via UPI apps. Requires manual verification.
              </p>
            </div>
            <Switch
              checked={paymentSettings.upiEnabled}
              onCheckedChange={(v) => setPaymentSettings((s) => ({ ...s, upiEnabled: v }))}
            />
          </div>

          {/* Merchant UPI ID */}
          <div className="space-y-2">
            <Label htmlFor="merchant-upi">Merchant UPI ID</Label>
            <Input
              id="merchant-upi"
              placeholder="merchant@upi"
              value={paymentSettings.merchantUpiId}
              onChange={(e) => setPaymentSettings((s) => ({ ...s, merchantUpiId: e.target.value }))}
              className="max-w-sm"
              disabled={!paymentSettings.upiEnabled}
            />
            <p className="text-xs text-muted-foreground">
              This UPI ID will be used to generate payment QR codes for customers.
            </p>
          </div>

          {/* Merchant Name */}
          <div className="space-y-2">
            <Label htmlFor="merchant-name">Merchant Name</Label>
            <Input
              id="merchant-name"
              placeholder="My Store"
              value={paymentSettings.merchantName}
              onChange={(e) => setPaymentSettings((s) => ({ ...s, merchantName: e.target.value }))}
              className="max-w-sm"
            />
            <p className="text-xs text-muted-foreground">
              Displayed to customers during checkout and on payment receipts.
            </p>
          </div>

          {/* Active methods summary */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Active methods:</span>
            {paymentSettings.razorpayEnabled && <Badge>Razorpay</Badge>}
            {paymentSettings.upiEnabled && <Badge>UPI QR</Badge>}
            <Badge variant="secondary">Cash on Delivery</Badge>
          </div>

          {!paymentSettings.razorpayEnabled && !paymentSettings.upiEnabled && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-4">
              <Info className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <p className="text-sm text-destructive">
                Only Cash on Delivery is enabled. Customers won't be able to pay online.
              </p>
            </div>
          )}

          <Button onClick={handleSavePayment} disabled={savingPayment}>
            {savingPayment ? "Saving..." : "Save Payment Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Commission Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-primary" />
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
              Changes apply to new payments immediately. Existing payments are not affected.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant={commissionEnabled ? "default" : "secondary"}>
              {commissionEnabled ? `${commissionPercentage}% Active` : "Commission Disabled"}
            </Badge>
          </div>

          <Button onClick={handleSaveCommission} disabled={saving}>
            {saving ? "Saving..." : "Save Commission Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
