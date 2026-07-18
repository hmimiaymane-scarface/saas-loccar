import { notFound, redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getReservationDetail, getChecklistTemplate, getDamagesList } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { ReturnWizard } from "@/components/domain/returns/return-wizard"

export default async function ReturnPage({
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

  if (reservation.status !== "active") {
    redirect(`/reservations/${id}`)
  }

  const [checklistTemplate, vehicleDamages] = await Promise.all([
    getChecklistTemplate(session.company.id),
    reservation.vehicle ? getDamagesList(session.company.id, { vehicleId: reservation.vehicle.id }) : Promise.resolve([]),
  ])

  return (
    <>
      <SectionHeader title={`Return — ${reservation.reference}`} description={reservation.customer.fullName} />
      <ReturnWizard
        reservation={reservation}
        companyId={session.company.id}
        checklistTemplate={checklistTemplate}
        vehicleDamages={vehicleDamages}
        canOverride={session.role === "owner" || session.role === "manager"}
      />
    </>
  )
}
