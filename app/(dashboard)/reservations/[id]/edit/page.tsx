import { notFound, redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getReservationDetail, getBranches, getTeamMembers } from "@/lib/data"
import { isEditableStatus } from "@/lib/reservations/status"
import { SectionHeader } from "@/components/domain/section-header"
import { ReservationForm } from "@/components/domain/reservations/reservation-form"
import { updateReservation } from "@/app/(dashboard)/reservations/actions"

export default async function EditReservationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/reservations")

  const { id } = await params
  const [reservation, branches] = await Promise.all([
    getReservationDetail(session.company.id, id),
    getBranches(session.company.id),
  ])
  if (!reservation) notFound()
  if (!isEditableStatus(reservation.status)) redirect(`/reservations/${id}`)

  let assignableEmployees: { userId: string; fullName: string }[] = []
  if (["owner", "manager"].includes(session.role)) {
    const team = await getTeamMembers(session.company.id)
    assignableEmployees = team
      .filter((m) => m.status === "active" && ["agent", "driver"].includes(m.role))
      .map((m) => ({ userId: m.userId, fullName: m.fullName ?? "Unnamed" }))
  }

  return (
    <>
      <SectionHeader title={`Edit ${reservation.reference}`} description={reservation.customer.fullName} />
      <ReservationForm
        action={updateReservation.bind(null, reservation.id)}
        companyTimezone={session.company.timezone}
        branches={branches}
        initial={{
          reservationId: reservation.id,
          customer: reservation.customer,
          vehicleId: reservation.vehicle?.id ?? null,
          vehicleLabel: reservation.vehicle ? `${reservation.vehicle.make} ${reservation.vehicle.model}` : null,
          requestedCategory: reservation.requestedCategory,
          branchId: reservation.branchId,
          pickupAt: reservation.pickupAt,
          returnAt: reservation.returnAt,
          pickupLocation: reservation.pickupLocation,
          returnLocation: reservation.returnLocation,
          dailyRateMad: reservation.dailyRateMad,
          discountMad: reservation.discountMad,
          notes: reservation.notes,
          assignedEmployeeId: reservation.assignedEmployeeId,
        }}
        assignableEmployees={assignableEmployees}
      />
    </>
  )
}
