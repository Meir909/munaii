import { Skeleton } from "@/components/ui/skeleton";

type Variant = "default" | "dashboard" | "list" | "map";

export function PageSkeleton({ variant = "default" }: { variant?: Variant }) {
  if (variant === "dashboard") {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full max-w-md" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (variant === "map") {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="w-full rounded-lg" style={{ aspectRatio: "16/10" }} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
