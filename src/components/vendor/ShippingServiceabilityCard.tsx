import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Truck } from "lucide-react";

interface Props {
  vendorId: string | null;
}

const PIN_RE = /^\d{6}$/;

const ShippingServiceabilityCard = ({ vendorId }: Props) => {
  const { toast } = useToast();
  const { hash } = useLocation();
  const sectionRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [worldwide, setWorldwide] = useState(true);
  const [pincodesInput, setPincodesInput] = useState("");

  // Load existing rules
  useEffect(() => {
    if (!vendorId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("vendor_serviceability")
        .select("pincode_pattern, ships")
        .eq("vendor_id", vendorId);
      if (!active) return;
      if (error) {
        console.error("[Serviceability] load failed", error);
      } else {
        const rows = data ?? [];
        const wildcard = rows.find((r) => r.pincode_pattern === "*" && r.ships);
        if (rows.length === 0 || wildcard) {
          setWorldwide(true);
          setPincodesInput("");
        } else {
          setWorldwide(false);
          setPincodesInput(rows.filter((r) => r.ships).map((r) => r.pincode_pattern).join(", "));
        }
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [vendorId]);

  // Smooth scroll + focus on #serviceability
  useEffect(() => {
    if (hash !== "#serviceability" || loading) return;
    const el = sectionRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.focus({ preventScroll: true });
    });
  }, [hash, loading]);

  const handleSave = async () => {
    if (!vendorId) return;
    let rows: { vendor_id: string; pincode_pattern: string; ships: boolean }[] = [];

    if (worldwide) {
      rows = [{ vendor_id: vendorId, pincode_pattern: "*", ships: true }];
    } else {
      const tokens = pincodesInput
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const unique = Array.from(new Set(tokens));
      const invalid = unique.filter((p) => !PIN_RE.test(p));
      if (invalid.length) {
        toast({
          title: "Invalid pincodes",
          description: `Each pincode must be exactly 6 digits. Invalid: ${invalid.slice(0, 5).join(", ")}`,
          variant: "destructive",
        });
        return;
      }
      if (unique.length === 0) {
        toast({
          title: "Add at least one pincode",
          description: "Enter at least one 6-digit pincode, or enable Pan-India / Worldwide.",
          variant: "destructive",
        });
        return;
      }
      rows = unique.map((p) => ({ vendor_id: vendorId, pincode_pattern: p, ships: true }));
    }

    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from("vendor_serviceability")
        .delete()
        .eq("vendor_id", vendorId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("vendor_serviceability").insert(rows);
      if (insErr) throw insErr;
      toast({ title: "Shipping rules saved" });
    } catch (e: any) {
      console.error("[Serviceability] save failed", e);
      toast({
        title: "Save failed",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      id="serviceability"
      ref={sectionRef}
      tabIndex={-1}
      className="scroll-mt-24 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" /> Shipping & Serviceability
        </CardTitle>
        <CardDescription>
          Control where your store ships. Choose Pan-India / Worldwide, or restrict to specific pincodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1">
                <Label htmlFor="ww-switch" className="text-base">
                  Deliver Worldwide / Pan-India
                </Label>
                <p className="text-sm text-muted-foreground">
                  No restrictions — your products are available to every customer.
                </p>
              </div>
              <Switch id="ww-switch" checked={worldwide} onCheckedChange={setWorldwide} />
            </div>

            {!worldwide && (
              <div className="space-y-2">
                <Label htmlFor="pincodes">Restrict to specific pincodes</Label>
                <Textarea
                  id="pincodes"
                  rows={4}
                  placeholder="e.g. 190001, 190002, 110001"
                  value={pincodesInput}
                  onChange={(e) => setPincodesInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated 6-digit Indian pincodes. Orders to other pincodes will be blocked at checkout.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save shipping rules
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ShippingServiceabilityCard;
