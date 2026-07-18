import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Wrench } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getMaintenanceList, getVehicles } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { Button } from "@/components/ui/button"
import { PaginationBar } from "@/components/domain/pagination-bar"
import { MaintenanceFilters } from "@/components/domain/maintenance/maintenance-filters"
import { MaintenanceListItem } from "@/components/domain/maintenance/maintenance-list-item"
import { ExportButton } from "@/components/domain/export-button"
import type { MaintenanceRecordStatus } from "@/types/rental"

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; status?: string; page?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const companyId = session.company.id

  const [vehicles, result] = await Promise.all([
    getVehicles(companyId),
    getMaintenanceList(
      companyId,
      { vehicleId: params.vehicle, status: params.status as MaintenanceRecordStatus | undefined },
      page,
      20
    ),
  ])

  return (
    <>
      <SectionHeader
        title="Maintenance"
        description={`${result.total} maintenance record${result.total === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton resource="maintenance" />
            <Button asChild>
              <Link href="/maintenance/new">
                <Plus />
                Schedule maintenance
              </Link>
            </Button>
          </div>
        }
      />

      <MaintenanceFilters vehicles={vehicles} />

      {result.items.length === 0 ? (
        <EmptyPlaceholder
          icon={Wrench}
          title="No maintenance records match your filters"
          description="Schedule maintenance or move a vehicle into maintenance to see it here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {result.items.map((record) => (
            <MaintenanceListItem key={record.id} record={record} />
          ))}
        </div>
      )}

      <PaginationBar total={result.total} page={result.page} pageSize={result.pageSize} />
    </>
  )
}
