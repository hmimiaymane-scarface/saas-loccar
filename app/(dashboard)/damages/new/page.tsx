import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getVehicles } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { DamageForm } from "@/components/domain/damages/damage-form"

export default async function NewDamagePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; reservation?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const vehicles = await getVehicles(session.company.id)

  return (
    <>
      <SectionHeader title="Record damage" description="Log damage found outside a guided pickup or return." />
      <DamageForm vehicles={vehicles} vehicleId={params.vehicle} reservationId={params.reservation} />
    </>
  )
}
