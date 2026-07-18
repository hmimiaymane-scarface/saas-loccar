import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getBranches } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { VehicleForm } from "@/components/domain/fleet/vehicle-form"
import { createVehicle } from "@/app/(dashboard)/fleet/actions"

export default async function NewVehiclePage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (session.role !== "owner" && session.role !== "manager") redirect("/fleet")

  const branches = await getBranches(session.company.id)

  return (
    <>
      <SectionHeader title="Add vehicle" description="Add a new vehicle to your fleet" />
      <VehicleForm action={createVehicle} branches={branches} />
    </>
  )
}
