import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Trash2, Check, Navigation, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { locationService } from "@/services/locationService";
import { inPincodeSchema } from "@/lib/validators/locationSchema";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Suggestion = { city: string; state: string; pincode: string };

const LocationDialog = ({ open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { savedLocations, refreshSaved, setLocationByPincode, isDetecting } = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open && user) refreshSaved(); }, [open, user, refreshSaved]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    setQuery("");
    setResults([]);
    setActiveIdx(0);
  }, [open]);

  // Debounced suggestions
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setLoadingResults(true);
    const t = setTimeout(async () => {
      try { setResults(await locationService.suggestions(query.trim())); }
      catch { setResults([]); }
      finally { setLoadingResults(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const submit = async (pin: string) => {
    const parsed = inPincodeSchema.safeParse(pin);
    if (!parsed.success) {
      toast({ title: "Invalid pincode", description: parsed.error.issues[0]?.message ?? "Please enter a valid pincode", variant: "destructive" });
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
        try {
          const d = await locationService.detect();
          if (d.pincode) await submit(d.pincode);
          else toast({ title: "Couldn't detect pincode", variant: "destructive" });
        } finally { setSubmitting(false); }
      },
      () => { setSubmitting(false); toast({ title: "Permission denied", variant: "destructive" }); },
    );
  };

  const isPinExact = useMemo(() => /^\d{6}$/.test(query.trim()), [query]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIdx]) submit(results[activeIdx].pincode);
      else if (isPinExact) submit(query.trim());
    }
  };

  const Body = (
    <div className="space-y-4">
      {/* GPS button */}
      <Button
        variant="outline"
        onClick={useGeo}
        disabled={submitting || isDetecting}
        className="w-full justify-start gap-2"
      >
        {(submitting || isDetecting) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4 text-primary" />}
        Use my current location
      </Button>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
      </div>

      {/* Combined search */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Enter PIN code or city"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKey}
            className="pl-9"
            aria-label="Search by pincode or city"
            aria-autocomplete="list"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border" role="listbox">
          {loadingResults && (
            <p className="text-xs text-muted-foreground p-3 text-center flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
            </p>
          )}
          {!loadingResults && results.length === 0 && query.trim().length >= 2 && (
            <div className="p-3 space-y-2">
              <p className="text-xs text-muted-foreground text-center">No matches found</p>
              {isPinExact && (
                <Button size="sm" className="w-full" onClick={() => submit(query.trim())} disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Try PIN {query.trim()}
                </Button>
              )}
            </div>
          )}
          {!loadingResults && results.length === 0 && query.trim().length < 2 && (
            <p className="text-xs text-muted-foreground p-3 text-center">Type at least 2 characters</p>
          )}
          {!loadingResults && results.map((s, i) => (
            <button
              key={s.pincode}
              role="option"
              aria-selected={i === activeIdx}
              className={`w-full text-left p-3 transition-colors flex justify-between items-center border-b last:border-0 ${i === activeIdx ? "bg-accent/40" : "hover:bg-accent/30"}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => submit(s.pincode)}
              disabled={submitting}
            >
              <span>
                <span className="font-medium">{s.city}</span>{" "}
                <span className="text-xs text-muted-foreground">{s.state}</span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{s.pincode}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Saved */}
      {user && savedLocations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Saved addresses</p>
          {savedLocations.map((l) => (
            <div key={l.id} className="flex items-center justify-between border rounded-md p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium flex items-center gap-2 truncate">
                  {l.label}
                  {l.is_default && <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">Default</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">{l.city} — {l.pincode}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => submit(l.pincode)} title="Use" aria-label={`Use ${l.label}`}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={async () => { await locationService.deleteUserLocation(l.id); refreshSaved(); }} title="Delete" aria-label={`Delete ${l.label}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Choose delivery location
            </SheetTitle>
          </SheetHeader>
          <div className="pt-4">{Body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Choose delivery location
          </DialogTitle>
        </DialogHeader>
        {Body}
      </DialogContent>
    </Dialog>
  );
};

export default LocationDialog;
