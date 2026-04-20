import { Star, ShieldCheck } from "lucide-react";
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
        width={56}
        height={56}
        className="h-14 w-14 rounded-full object-cover mx-auto mb-3"
        loading="lazy"
        decoding="async"
      />
      <h3 className="text-sm font-medium flex items-center justify-center gap-1">
        {vendor.storeName}
        {vendor.isVerified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
      </h3>
      <div className="flex items-center justify-center gap-1 mt-1">
        <Star className="h-3 w-3 fill-accent text-accent" />
        <span className="text-xs tabular-nums">{vendor.rating}</span>
      </div>
      {vendor.trustScore > 0 && (
        <span className={`inline-block text-[10px] font-semibold mt-1.5 px-1.5 py-0.5 rounded-full ${
          vendor.trustScore >= 80 ? "text-success bg-success/10" :
          vendor.trustScore >= 60 ? "text-accent bg-accent/10" :
          "text-destructive bg-destructive/10"
        }`}>
          Trust {Math.round(vendor.trustScore)}
        </span>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">
        {vendor.totalSales.toLocaleString()} sales
      </p>
    </div>
  );
};

export default VendorCard;
