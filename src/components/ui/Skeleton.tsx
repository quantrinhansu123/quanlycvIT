import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-gray-200/80", className)} />;
}

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-6 py-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export function DetailPanelSkeleton() {
  return (
    <div className="h-full overflow-hidden bg-white px-3 py-3 @sm/detail:px-5">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
        <Skeleton className="h-5 flex-1" />
        <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 pt-4 @md/detail:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-5 h-80 rounded-2xl" />
    </div>
  );
}
