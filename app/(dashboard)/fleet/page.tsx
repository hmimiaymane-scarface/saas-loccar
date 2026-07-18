import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Car as CarIcon } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getVehiclesList, getBranches } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { Button } from "@/components/ui/button"
import { FleetFilters } from "@/components/domain/fleet/fleet-filters"
import { VehicleCard } from "@/components/domain/fleet/vehicle-card"
import { PaginationBar } from "@/components/domain/pagination-bar"
import type { VehicleCategory, VehicleStatus } from "@/types/rental"

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string
    status?: string
    category?: string
    branch?: string
    page?: string
  }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const companyId = session.company.id

  const [branches, result] = await Promise.all([
    getBranches(companyId),
    getVehiclesList(
      companyId,
      {
        search: params.search,
        status: params.status as VehicleStatus | undefined,
        category: params.category as VehicleCategory | undefined,
        branchId: params.branch,
      },
      page,
      24
    ),
  ])

  const canAddVehicle = session.role === "owner" || session.role === "manager"

  return (
    <>
      <SectionHeader
        title="Fleet"
        description={`${result.total} vehicle${result.total === 1 ? "" : "s"} in your fleet`}
        actions={
          canAddVehicle ? (
            <Button asChild>
              <Link href="/fleet/new">
                <Plus />
                Add vehicle
              </Link>
            </Button>
          ) : undefined
        }
      />

      <FleetFilters branches={branches} />

      {result.items.length === 0 ? (
        <EmptyPlaceholder
          icon={CarIcon}
          title="No vehicles match your filters"
          description="Try clearing filters, or add your first vehicle to get started."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.items.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      )}

      <PaginationBar total={result.total} page={result.page} pageSize={result.pageSize} />
    </>
  )
}
