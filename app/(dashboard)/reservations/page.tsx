import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, ClipboardList } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getReservationsList, getBranches } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { Button } from "@/components/ui/button"
import { ReservationFilters } from "@/components/domain/reservations/reservation-filters"
import { ReservationListItem } from "@/components/domain/reservations/reservation-list-item"
import { PaginationBar } from "@/components/domain/pagination-bar"
import { ExportButton } from "@/components/domain/export-button"
import type { BookingStatus } from "@/types/rental"

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string
    status?: string
    from?: string
    to?: string
    branch?: string
    page?: string
  }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const companyId = session.company.id
  const statuses = params.status?.split(",").filter(Boolean) as BookingStatus[] | undefined

  const [branches, result] = await Promise.all([
    getBranches(companyId),
    getReservationsList(
      companyId,
      {
        search: params.search,
        statuses,
        branchId: params.branch,
        dateFrom: params.from,
        dateTo: params.to,
      },
      page,
      20
    ),
  ])

  const canCreate = session.role === "owner" || session.role === "manager" || session.role === "agent"

  return (
    <>
      <SectionHeader
        title="Reservations"
        description={`${result.total} reservation${result.total === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton resource="reservations" />
            {canCreate && (
              <Button asChild>
                <Link href="/reservations/new">
                  <Plus />
                  New reservation
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <ReservationFilters branches={branches} />

      {result.items.length === 0 ? (
        <EmptyPlaceholder
          icon={ClipboardList}
          title="No reservations match your filters"
          description="Try clearing filters, or create your first reservation."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {result.items.map((booking) => (
            <ReservationListItem key={booking.id} booking={booking} />
          ))}
        </div>
      )}

      <PaginationBar total={result.total} page={result.page} pageSize={result.pageSize} />
    </>
  )
}
