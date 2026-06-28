import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Truck, Globe2, Mountain, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  vendorId: string | null;
}

type Mode = "worldwide" | "jk" | "pincodes";

const PIN_RE = /^\d{6}$/;
const JK_PATTERNS = ["18%", "19%"];

const OPTIONS: { value: Mode; title: string; description: string; Icon: typeof Globe2 }[] = [
  {
    value: "worldwide",
    title: "Deliver Worldwide / Pan-India",
    description: "Your products are available to every customer globally without restrictions.",
    Icon: Globe2,
  },
  {
    value: "jk",
    title: "All Over J&K Only",
    description: "Restrict sales strictly to the Jammu & Kashmir region (pincodes starting with 18 or 19).",
    Icon: Mountain,
  },
  {
    value: "pincodes",
    title: "Specific Pincodes",
    description: "Restrict delivery to an explicit list of pincodes.",
    Icon: MapPin,
  },
];

const ShippingServiceabilityCard = ({ vendorId }: Props) => {
  const { toast } = useToast();
  const { hash } = useLocation();
  const sectionRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("worldwide");
  const [pincodesInput, setPincodesInput] = useState("");

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
        const rows = (data ?? []).filter((r) => r.ships);
        const patterns = rows.map((r) => r.pincode_pattern);
        const hasWildcard = patterns.includes("*");
        const jkOnly =
          patterns.length === JK_PATTERNS.length &&
          JK_PATTERNS.every((p) => patterns.includes(p));
        if (rows.length === 0 || hasWildcard) {
          setMode("worldwide");
          setPincodesInput("");
        } else if (jkOnly) {
          setMode("jk");
          setPincodesInput("");
        } else {
          setMode("pincodes");
          setPincodesInput(patterns.join(", "));
        }
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [vendorId]);

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

    if (mode === "worldwide") {
      rows = [{ vendor_id: vendorId, pincode_pattern: "*", ships: true }];
    } else if (mode === "jk") {
      rows = JK_PATTERNS.map((p) => ({ vendor_id: vendorId, pincode_pattern: p, ships: true }));
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
          description: "Enter at least one 6-digit pincode, or pick a broader option above.",
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
          Choose how broadly your store ships. You can update this at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              className="grid gap-3"
            >
              {OPTIONS.map(({ value, title, description, Icon }) => {
                const active = mode === value;
                return (
                  <Label
                    key={value}
                    htmlFor={`ship-${value}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors",
                      active ? "border-primary bg-primary/5" : "hover:bg-accent",
                    )}
                  >
                    <RadioGroupItem id={`ship-${value}`} value={value} className="mt-1" />
                    <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium leading-none">{title}</div>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                  </Label>
                );
              })}
            </RadioGroup>

            {mode === "pincodes" && (
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
