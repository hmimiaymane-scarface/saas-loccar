import { redirect } from "next/navigation"

import { getSessionContext, type SessionContext } from "@/lib/auth/session"
import { getBranches, getCustomerDetail, getTeamMembers, getChecklistTemplate } from "@/lib/data"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { getCustomerIntelligence } from "@/lib/customer-intelligence-store"
import { assessReturningCustomerReadiness, type ReturningCustomerReadiness } from "@/lib/customer-readiness"
import { SectionHeader } from "@/components/domain/section-header"
import { NewRentalWizard } from "@/components/domain/reservations/new-rental-wizard"
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

/**
 * Productization wave 3 phase 18 — this route's content is now
 * `NewRentalWizard`, a single continuous flow from customer search all
 * the way through to an active rental (previously 7 page loads across
 * `/customers/new`, `/reservations/new`, `/reservations/[id]`,
 * `/reservations/[id]/pickup`, `/reservations/[id]/contract-preview`,
 * and `/contracts/[id]`). The URL and every fast-path entry point into
 * it (`?customerId=`, `?vehicleId=`, `?rate=`, `?pickup=`) are
 * unchanged — nothing else in the app needed to change its links.
 */
export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string; rate?: string; pickup?: string; customerId?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/reservations")

  const params = await searchParams
  const companyId = session.company.id
  const [branches, checklistTemplate] = await Promise.all([getBranches(companyId), getChecklistTemplate(companyId)])

  // Roadmap phase 16 — only owner/manager can assign a reservation's
  // field work to a specific agent/driver; the form itself hides the
  // picker entirely when this list is empty.
  let assignableEmployees: { userId: string; fullName: string }[] = []
  if (["owner", "manager"].includes(session.role)) {
    const team = await getTeamMembers(companyId)
    assignableEmployees = team
      .filter((m) => m.status === "active" && ["agent", "driver"].includes(m.role))
      .map((m) => ({ userId: m.userId, fullName: m.fullName ?? "Unnamed" }))
  }

  // Coming back from the customer-search fast path (?customerId=), or
  // from the Customer Command Center's "Start rental" button (roadmap
  // phase 09's Returning-Customer Fast Path) — pre-select the customer
  // instead of making the user search again.
  const preselectedCustomer = params.customerId
    ? await getCustomerDetail(companyId, params.customerId)
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
      <SectionHeader title="New rental" description="From customer search to an active rental, one continuous flow." />
      <NewRentalWizard
        companyId={companyId}
        companyTimezone={session.company.timezone}
        branches={branches}
        checklistTemplate={checklistTemplate}
        canOverride={["owner", "manager"].includes(session.role)}
        assignableEmployees={assignableEmployees}
        preselectedCustomer={preselectedCustomer ?? undefined}
        defaultVehicleId={params.vehicleId}
        defaultDailyRate={params.rate ? Number(params.rate) : undefined}
        defaultPickupDate={params.pickup}
        defaultCategory={defaultCategory ?? undefined}
        returningCustomerReadiness={returningCustomerReadiness ?? undefined}
      />
    </>
  )
}
