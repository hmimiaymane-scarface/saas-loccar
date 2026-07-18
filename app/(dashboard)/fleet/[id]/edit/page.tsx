import { notFound, redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getVehicleDetail, getBranches } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { VehicleForm } from "@/components/domain/fleet/vehicle-form"
import { updateVehicle } from "@/app/(dashboard)/fleet/actions"

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (session.role !== "owner" && session.role !== "manager") redirect("/fleet")

  const { id } = await params
  const [vehicle, branches] = await Promise.all([
    getVehicleDetail(session.company.id, id),
    getBranches(session.company.id),
  ])
  if (!vehicle) notFound()

  return (
    <>
      <SectionHeader title={`Edit ${vehicle.make} ${vehicle.model}`} description={vehicle.plate} />
      <VehicleForm action={updateVehicle.bind(null, vehicle.id)} branches={branches} vehicle={vehicle} />
    </>
  )
}
