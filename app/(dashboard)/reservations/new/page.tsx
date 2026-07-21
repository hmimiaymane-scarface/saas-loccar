import { redirect } from "next/navigation"

import { getSessionContext, type SessionContext } from "@/lib/auth/session"
import { getBranches, getCustomerDetail, getTeamMembers } from "@/lib/data"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { getCustomerIntelligence } from "@/lib/customer-intelligence-store"
import { assessReturningCustomerReadiness, type ReturningCustomerReadiness } from "@/lib/customer-readiness"
import { SectionHeader } from "@/components/domain/section-header"
import { ReservationForm } from "@/components/domain/reservations/reservation-form"
import { createReservation } from "@/app/(dashboard)/reservations/actions"
import type { VehicleCategory } from "@/types/rental"

/** Same degrade-to-null convention as the vehicle/customer detail
 * pages — advisory only, never blocks reaching the form itself. */
async function loadPreferredCategory(session: SessionContext, customerId: string): Promise<VehicleCategory | null> {
  if (!isSupabaseConfigured) return null
  try {
    const supabase = await createClient()
    const intelligence = await getCustomerIntelligence(supabase, session, customerId)
    return intelligence?.clv.preferredCategory ?? null
  } catch {
    return null
  }
}

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

  // Roadmap phase 16 — only owner/manager can assign a reservation's
  // field work to a specific agent/driver; the form itself hides the
  // picker entirely when this list is empty.
  let assignableEmployees: { userId: string; fullName: string }[] = []
  if (["owner", "manager"].includes(session.role)) {
    const team = await getTeamMembers(session.company.id)
    assignableEmployees = team
      .filter((m) => m.status === "active" && ["agent", "driver"].includes(m.role))
      .map((m) => ({ userId: m.userId, fullName: m.fullName ?? "Unnamed" }))
  }

  // Coming back from the standalone "Add customer" flow (see the returnTo
  // link in the reservation form's quick-add section), or from the
  // Customer Command Center's "Start rental" button (roadmap phase 09's
  // Returning-Customer Fast Path) — pre-select the customer instead of
  // making the user search again.
  const preselectedCustomer = params.customerId
    ? await getCustomerDetail(session.company.id, params.customerId)
    : null

  let defaultCategory: VehicleCategory | null = null
  let returningCustomerReadiness: ReturningCustomerReadiness | null = null
  if (preselectedCustomer) {
    defaultCategory = await loadPreferredCategory(session, preselectedCustomer.id)
    returningCustomerReadiness = assessReturningCustomerReadiness({
      licenseExpiresAt: preselectedCustomer.licenseExpiresAt || null,
      documents: preselectedCustomer.documents,
    })
  }

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
        defaultCategory={defaultCategory ?? undefined}
        preselectedCustomer={preselectedCustomer ?? undefined}
        returningCustomerReadiness={returningCustomerReadiness ?? undefined}
        assignableEmployees={assignableEmployees}
      />
    </>
  )
}
