import { SectionHeader } from "@/components/domain/section-header"
import { ListPageSkeleton } from "@/components/domain/list-page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

export default function FleetLoading() {
  return (
    <>
      <SectionHeader title="Fleet" description="Loading your fleet…" />
      <Skeleton className="h-10 w-full max-w-2xl" />
      <ListPageSkeleton variant="grid" rows={8} />
    </>
  )
}
