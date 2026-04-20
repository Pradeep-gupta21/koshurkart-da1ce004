import { MapPin } from "lucide-react";
import { useState } from "react";
import { useLocation } from "@/contexts/LocationContext";
import LocationDialog from "./LocationDialog";

const LocationPill = () => {
  const { location, isDetecting } = useLocation();
  const [open, setOpen] = useState(false);

  const label = isDetecting
    ? "Detecting…"
    : location?.city
      ? `${location.city}${location.pincode ? ` ${location.pincode}` : ""}`
      : "Select location";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-1.5 text-left text-xs text-primary-foreground/90 hover:text-primary-foreground transition-colors px-2 py-1 rounded-md hover:bg-primary-foreground/10 max-w-[220px]"
        aria-label="Change delivery location"
      >
        <MapPin className="h-4 w-4 shrink-0" />
        <span className="flex flex-col leading-tight overflow-hidden">
          <span className="text-[10px] opacity-80">Deliver to</span>
          <span className="font-semibold truncate">{label}</span>
        </span>
      </button>
      <LocationDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export default LocationPill;
