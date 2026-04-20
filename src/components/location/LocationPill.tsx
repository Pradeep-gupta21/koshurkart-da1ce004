import { MapPin, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useLocation } from "@/contexts/LocationContext";
import LocationDialog from "./LocationDialog";

const JK_CITIES = new Set(["Srinagar", "Jammu", "Anantnag", "Baramulla", "Sopore", "Udhampur", "Kathua"]);

const LocationPill = () => {
  const { location, isDetecting } = useLocation();
  const [open, setOpen] = useState(false);

  const isJK = location?.state === "Jammu and Kashmir" || (location?.city && JK_CITIES.has(location.city));
  const cityLabel = location?.city
    ? `${location.city}${location.pincode ? ` ${location.pincode}` : ""}`
    : "Select location";
  const label = isDetecting ? "Detecting…" : cityLabel;
  const topLine = isJK ? "Delivering to" : "Deliver to";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-left text-xs text-primary-foreground/90 hover:text-primary-foreground hover:bg-primary-foreground/15 transition-colors px-2 py-1 rounded-md max-w-[220px]"
        aria-label="Change delivery location"
      >
        <MapPin className="h-4 w-4 shrink-0" />
        {/* Mobile: compact */}
        <span className="sm:hidden font-semibold truncate">
          {isDetecting ? "…" : (location?.city ?? "Location")}
        </span>
        {/* sm+: two-line */}
        <span className="hidden sm:flex flex-col leading-tight overflow-hidden">
          <span className="text-[10px] opacity-80">{topLine}</span>
          <span className={`font-semibold truncate ${isJK ? "text-accent" : ""}`}>{label}</span>
        </span>
        <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
      </button>
      <LocationDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export default LocationPill;
