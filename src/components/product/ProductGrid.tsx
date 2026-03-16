import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ProductGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  loading?: boolean;
  skeletonCount?: number;
  className?: string;
}

const colsMap = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
};

const SkeletonCard = () => (
  <div className="rounded-xl overflow-hidden bg-card marketplace-shadow">
    <div className="aspect-square w-full shimmer" />
    <div className="p-4 space-y-2.5">
      <div className="h-3 w-1/3 rounded-md shimmer" />
      <div className="h-4 w-3/4 rounded-md shimmer" />
      <div className="h-3 w-1/2 rounded-md shimmer" />
      <div className="h-5 w-1/3 rounded-md shimmer" />
    </div>
  </div>
);

const ProductGrid = ({ children, columns = 4, loading = false, skeletonCount = 8, className }: ProductGridProps) => {
  if (loading) {
    return (
      <div className={cn("grid gap-4", colsMap[columns], className)}>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 stagger-children", colsMap[columns], className)}>
      {children}
    </div>
  );
};

export default ProductGrid;
