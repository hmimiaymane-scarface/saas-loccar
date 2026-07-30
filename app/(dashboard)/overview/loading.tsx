import { SectionHeader } from "@/components/domain/section-header"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Roadmap phase 40. Overview is the single most data-hungry page in
 * the app (a dozen-plus queries feeding the Business Command Center's
 * many sections) — deliberately not pixel-matching every section here,
 * just giving the "hero stats, then a couple of big cards, then a
 * two-column area" shape so the transition from skeleton to real
 * content doesn't visibly jump in overall structure.
 */
export default function OverviewLoading() {
  return (
    <>
      <SectionHeader title="Overview" description="Loading your business snapshot…" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="gap-4">
            <div className="flex items-start justify-between px-(--card-spacing)">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="size-8 rounded-full" />
            </div>
            <div className="flex flex-col gap-2 px-(--card-spacing)">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex flex-col gap-3 px-(--card-spacing)">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-40 w-full" />
          </div>
        </Card>
        <Card>
          <div className="flex flex-col gap-3 px-(--card-spacing)">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-40 w-full" />
          </div>
        </Card>
      </div>
    </>
  )
}
