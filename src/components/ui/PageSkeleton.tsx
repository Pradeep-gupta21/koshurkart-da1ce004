import { Skeleton } from "@/components/ui/skeleton";

const PageSkeleton = () => (
  <div className="container mx-auto px-4 py-8 space-y-4" aria-busy="true" aria-label="Loading">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-4 w-1/2" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  </div>
);

export default PageSkeleton;
