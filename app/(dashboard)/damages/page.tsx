import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, AlertTriangle } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getDamagesList, getVehicles } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { Button } from "@/components/ui/button"
import { DamageFilters } from "@/components/domain/damages/damage-filters"
import { DamageListItem } from "@/components/domain/damages/damage-list-item"
import type { DamageStatus } from "@/types/rental"

export default async function DamagesPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; status?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const companyId = session.company.id

  const [vehicles, damages] = await Promise.all([
    getVehicles(companyId),
    getDamagesList(companyId, {
      vehicleId: params.vehicle,
      status: params.status as DamageStatus | undefined,
    }),
  ])

  const canCreate = session.role === "owner" || session.role === "manager" || session.role === "agent"

  return (
    <>
      <SectionHeader
        title="Damages"
        description={`${damages.length} damage record${damages.length === 1 ? "" : "s"}`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/damages/new">
                <Plus />
                Record damage
              </Link>
            </Button>
          ) : undefined
        }
      />

      <DamageFilters vehicles={vehicles} />

      {damages.length === 0 ? (
        <EmptyPlaceholder
          icon={AlertTriangle}
          title="No damage records match your filters"
          description="Damage discovered during pickup or return inspections shows up here automatically."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {damages.map((damage) => (
            <DamageListItem key={damage.id} damage={damage} />
          ))}
        </div>
      )}
    </>
  )
}
