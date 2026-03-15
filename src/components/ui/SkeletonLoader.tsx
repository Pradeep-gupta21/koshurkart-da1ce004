import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SkeletonLoaderProps {
  variant?: "product-card" | "vendor-card" | "stat-card" | "list-item";
  count?: number;
  className?: string;
}

const ProductCardSkeleton = () => (
  <div className="rounded-xl overflow-hidden bg-card marketplace-shadow">
    <Skeleton className="aspect-square w-full" />
    <div className="p-4 space-y-2">
      <Skeleton className="h-3 w-1/4" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-5 w-1/3" />
    </div>
  </div>
);

const VendorCardSkeleton = () => (
  <div className="rounded-xl bg-card marketplace-shadow p-4 flex flex-col items-center">
    <Skeleton className="h-14 w-14 rounded-full" />
    <Skeleton className="h-4 w-20 mt-3" />
    <Skeleton className="h-3 w-12 mt-1" />
    <Skeleton className="h-3 w-16 mt-1" />
  </div>
);

const StatCardSkeleton = () => (
  <div className="rounded-xl bg-card marketplace-shadow p-6 space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-5 rounded" />
    </div>
    <Skeleton className="h-8 w-20" />
  </div>
);

const ListItemSkeleton = () => (
  <div className="flex items-center gap-4 py-3">
    <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
    <Skeleton className="h-5 w-16" />
  </div>
);

const variants = {
  "product-card": ProductCardSkeleton,
  "vendor-card": VendorCardSkeleton,
  "stat-card": StatCardSkeleton,
  "list-item": ListItemSkeleton,
};

const SkeletonLoader = ({ variant = "product-card", count = 1, className }: SkeletonLoaderProps) => {
  const Component = variants[variant];
  return (
    <div className={cn(className)}>
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} />
      ))}
    </div>
  );
};

export { SkeletonLoader, ProductCardSkeleton, VendorCardSkeleton, StatCardSkeleton, ListItemSkeleton };
export default SkeletonLoader;
