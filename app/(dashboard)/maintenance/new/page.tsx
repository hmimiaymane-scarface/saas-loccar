import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getVehicles } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { MaintenanceForm } from "@/components/domain/maintenance/maintenance-form"

export default async function NewMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const vehicles = await getVehicles(session.company.id)

  return (
    <>
      <SectionHeader title="Schedule maintenance" description="Plan work, or move a vehicle into maintenance now." />
      <MaintenanceForm vehicles={vehicles} vehicleId={params.vehicle} />
    </>
  )
}
