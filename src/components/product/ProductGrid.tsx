import { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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

const ProductGrid = ({ children, columns = 4, loading = false, skeletonCount = 8, className }: ProductGridProps) => {
  if (loading) {
    return (
      <div className={cn("grid gap-4", colsMap[columns], className)}>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <div key={i} className="rounded-xl overflow-hidden">
            <Skeleton className="aspect-square w-full" />
            <div className="p-4 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4", colsMap[columns], className)}>
      {children}
    </div>
  );
};

export default ProductGrid;
