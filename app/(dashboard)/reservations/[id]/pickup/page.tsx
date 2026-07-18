import { notFound, redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getReservationDetail, getChecklistTemplate, getDamagesList } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { PickupWizard } from "@/components/domain/pickup/pickup-wizard"

export default async function PickupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/reservations")

  const { id } = await params
  const reservation = await getReservationDetail(session.company.id, id)
  if (!reservation) notFound()

  if (!["request", "pending", "confirmed"].includes(reservation.status)) {
    redirect(`/reservations/${id}`)
  }

  const [checklistTemplate, vehicleDamages] = await Promise.all([
    getChecklistTemplate(session.company.id),
    reservation.vehicle ? getDamagesList(session.company.id, { vehicleId: reservation.vehicle.id }) : Promise.resolve([]),
  ])

  return (
    <>
      <SectionHeader title={`Pickup — ${reservation.reference}`} description={reservation.customer.fullName} />
      <PickupWizard
        reservation={reservation}
        companyId={session.company.id}
        checklistTemplate={checklistTemplate}
        vehicleDamages={vehicleDamages}
        canOverride={session.role === "owner" || session.role === "manager"}
      />
    </>
  )
}
