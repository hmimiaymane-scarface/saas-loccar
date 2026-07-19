import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getBranches, getCustomerDetail } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { ReservationForm } from "@/components/domain/reservations/reservation-form"
import { createReservation } from "@/app/(dashboard)/reservations/actions"

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string; rate?: string; pickup?: string; customerId?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/reservations")

  const params = await searchParams
  const branches = await getBranches(session.company.id)

  // Coming back from the standalone "Add customer" flow (see the returnTo
  // link in the reservation form's quick-add section) — pre-select the
  // customer that was just created instead of making the user search again.
  const preselectedCustomer = params.customerId
    ? await getCustomerDetail(session.company.id, params.customerId)
    : null

  return (
    <>
      <SectionHeader title="New reservation" description="Book a vehicle for a customer" />
      <ReservationForm
        action={createReservation}
        companyTimezone={session.company.timezone}
        branches={branches}
        defaultVehicleId={params.vehicleId}
        defaultDailyRate={params.rate ? Number(params.rate) : undefined}
        defaultPickupDate={params.pickup}
        preselectedCustomer={preselectedCustomer ?? undefined}
      />
    </>
  )
}
