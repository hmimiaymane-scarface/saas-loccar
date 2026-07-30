import { Skeleton } from "@/components/ui/skeleton"

interface ListPageSkeletonProps {
  /** "grid" mirrors the fleet page's card grid, "list" mirrors the
   * customers/reservations pages' stacked rows. */
  variant: "grid" | "list"
  rows?: number
}

/**
 * Roadmap phase 40 (Slow-Network Experience). Shared body for the list
 * pages' `loading.tsx` files — approximates each real list item's
 * `rounded-3xl border border-border bg-card p-4 shadow-sm` shell (see
 * `CustomerListItem`/`VehicleCard`) closely enough that the page
 * doesn't visibly "pop" once real content replaces it, without trying
 * to pixel-match every field of every card variant.
 */
function ListPageSkeleton({ variant, rows = 6 }: ListPageSkeletonProps) {
  if (variant === "grid") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export { ListPageSkeleton }
