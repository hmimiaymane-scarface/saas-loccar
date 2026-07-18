import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getBranches } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { ReservationForm } from "@/components/domain/reservations/reservation-form"
import { createReservation } from "@/app/(dashboard)/reservations/actions"

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string; rate?: string; pickup?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/reservations")

  const params = await searchParams
  const branches = await getBranches(session.company.id)

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
      />
    </>
  )
}
