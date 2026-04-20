import { Skeleton } from "@/components/ui/skeleton";

const SidebarSkeleton = () => {
  return (
    <div className="px-5 py-4 space-y-6" aria-busy="true" aria-label="Loading navigation">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-shrink-0 w-24 space-y-2">
              <Skeleton className="h-24 w-24 rounded-md" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
};

export default SidebarSkeleton;
