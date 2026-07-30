import { SectionHeader } from "@/components/domain/section-header"
import { ListPageSkeleton } from "@/components/domain/list-page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

export default function ReservationsLoading() {
  return (
    <>
      <SectionHeader title="Reservations" description="Loading your reservations…" />
      <Skeleton className="h-10 w-full max-w-2xl" />
      <ListPageSkeleton variant="list" rows={7} />
    </>
  )
}
