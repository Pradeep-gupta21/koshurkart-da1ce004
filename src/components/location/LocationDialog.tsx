import { useEffect, useState } from "react";
import { Loader2, MapPin, Trash2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/hooks/useAuth";
import { locationService } from "@/services/locationService";
import { inPincodeSchema } from "@/lib/validators/locationSchema";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const LocationDialog = ({ open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const { savedLocations, refreshSaved, setLocationByPincode } = useLocation();
  const [pincode, setPincode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<Array<{ city: string; state: string; pincode: string }>>([]);

  useEffect(() => { if (open && user) refreshSaved(); }, [open, user, refreshSaved]);

  useEffect(() => {
    if (cityQuery.length < 2) { setCityResults([]); return; }
    const t = setTimeout(async () => {
      try { setCityResults(await locationService.cities(cityQuery)); } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [cityQuery]);

  const submit = async (pin: string) => {
    const parsed = inPincodeSchema.safeParse(pin);
    if (!parsed.success) {
      toast({ title: "Invalid pincode", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const result = await setLocationByPincode(parsed.data);
    setSubmitting(false);
    if (!result.ok) {
      toast({ title: "Not serviceable", description: result.message, variant: "destructive" });
      return;
    }
    toast({ title: "Location updated", description: `Delivering to ${parsed.data}` });
    onOpenChange(false);
  };

  const useGeo = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation unavailable", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    navigator.geolocation.getCurrentPosition(
      async () => {
        // We don't reverse-geocode coords client-side; fall back to IP detect via edge fn
        try {
          const d = await locationService.detect();
          if (d.pincode) await submit(d.pincode);
          else toast({ title: "Couldn't detect pincode", variant: "destructive" });
        } finally { setSubmitting(false); }
      },
      () => { setSubmitting(false); toast({ title: "Permission denied", variant: "destructive" }); },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Choose delivery location
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="pincode">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: user ? "1fr 1fr 1fr" : "1fr 1fr" }}>
            <TabsTrigger value="pincode">Pincode</TabsTrigger>
            <TabsTrigger value="city">City</TabsTrigger>
            {user && <TabsTrigger value="saved">Saved</TabsTrigger>}
          </TabsList>

          <TabsContent value="pincode" className="space-y-3 pt-3">
            <Input
              placeholder="Enter 6-digit pincode"
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
            />
            <div className="flex gap-2">
              <Button onClick={() => submit(pincode)} disabled={submitting || pincode.length !== 6} className="flex-1">
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Apply
              </Button>
              <Button variant="outline" onClick={useGeo} disabled={submitting}>Use my location</Button>
            </div>
          </TabsContent>

          <TabsContent value="city" className="space-y-3 pt-3">
            <Input
              placeholder="Type a city (e.g. Mumbai)"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto divide-y rounded-md border">
              {cityResults.length === 0 && (
                <p className="text-xs text-muted-foreground p-3 text-center">Start typing to search cities</p>
              )}
              {cityResults.map((c) => (
                <button
                  key={c.pincode}
                  className="w-full text-left p-3 hover:bg-accent/30 transition-colors flex justify-between items-center"
                  onClick={() => submit(c.pincode)}
                >
                  <span><span className="font-medium">{c.city}</span> <span className="text-xs text-muted-foreground">{c.state}</span></span>
                  <span className="text-xs tabular-nums text-muted-foreground">{c.pincode}</span>
                </button>
              ))}
            </div>
          </TabsContent>

          {user && (
            <TabsContent value="saved" className="space-y-2 pt-3">
              {savedLocations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No saved addresses yet.</p>
              )}
              {savedLocations.map((l) => (
                <div key={l.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      {l.label}
                      {l.is_default && <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">Default</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{l.city} — {l.pincode}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => submit(l.pincode)} title="Use">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await locationService.deleteUserLocation(l.id); refreshSaved(); }} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default LocationDialog;
