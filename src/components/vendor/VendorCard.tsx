import { Star } from "lucide-react";
import { Vendor } from "@/types";
import { cn } from "@/lib/utils";

interface VendorCardProps {
  vendor: Vendor;
  className?: string;
  onClick?: () => void;
}

const VendorCard = ({ vendor, className, onClick }: VendorCardProps) => {
  return (
    <div
      className={cn(
        "bg-card rounded-xl marketplace-shadow p-4 text-center hover:-translate-y-0.5 hover:marketplace-shadow-hover transition-all duration-200 cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <img
        src={vendor.logo}
        alt={vendor.storeName}
        className="h-14 w-14 rounded-full object-cover mx-auto mb-3"
        loading="lazy"
      />
      <h3 className="text-sm font-medium">{vendor.storeName}</h3>
      <div className="flex items-center justify-center gap-1 mt-1">
        <Star className="h-3 w-3 fill-accent text-accent" />
        <span className="text-xs tabular-nums">{vendor.rating}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        {vendor.totalSales.toLocaleString()} sales
      </p>
    </div>
  );
};

export default VendorCard;
