import { SectionHeader } from "@/components/domain/section-header"
import { ListPageSkeleton } from "@/components/domain/list-page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

export default function CustomersLoading() {
  return (
    <>
      <SectionHeader title="Customers" description="Loading your customers…" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <ListPageSkeleton variant="list" rows={7} />
    </>
  )
}
