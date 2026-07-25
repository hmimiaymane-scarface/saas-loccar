import { createClient } from "@/lib/supabase/server"
import { resolveReportPeriod } from "@/lib/reports"
import { getOpenOperationsFeedItems } from "@/lib/operations-feed/data"
import { bookings as mockBookings } from "@/lib/mock/bookings"
import { inspections as mockInspections } from "@/lib/mock/inspections"
import { maintenanceRecords as mockMaintenanceRecords } from "@/lib/mock/maintenance-records"
import { isSupabaseConfigured } from "@/lib/env"
import type { EmployeeRole } from "@/types/rental"
import type { MissionReservationInput, MissionFeedItemInput, MissionMaintenanceInput } from "@/lib/mobile/mission-feed"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const RELEVANT_STATUSES = ["confirmed", "pending", "active"]
const OPEN_MAINTENANCE_STATUSES = ["planned", "scheduled", "in_progress", "waiting_for_parts"]

/** Roadmap phase 17 — cleaner/mechanic get maintenance_records instead
 * of reservations on their mission feed (they have no
 * view_reservations grant and nothing there is relevant to their job);
 * every other role keeps the exact reservations-based feed from before
 * this phase. */
function maintenanceTypeForRole(role: EmployeeRole): "cleaning" | "non_cleaning" | null {
  if (role === "cleaner") return "cleaning"
  if (role === "mechanic") return "non_cleaning"
  return null
}

/** Mirrors lib/data.ts's own private isMockMode() (not exported from
 * there) — same two conditions, kept in sync deliberately rather than
 * exporting a cross-cutting helper for one caller. */
function isMockMode(): boolean {
  return !isSupabaseConfigured || process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true"
}

/**
 * The thin DB layer for lib/mobile/mission-feed.ts's pure
 * `buildMissionFeed` — gathers today's (company-timezone) reservations
 * relevant to this employee (assigned to them, or unassigned and so
 * visible to any agent — see the assigned_employee_id migration's own
 * comment) plus the operations feed's own items for those same
 * reservations/vehicles/customers, and shapes both into the pure
 * function's plain input types. Contains no "what does this mean"
 * logic itself — that's entirely in the pure module.
 */
export async function getMobileMissionFeedInputs(
  supabase: SupabaseServerClient | null,
  companyId: string,
  employeeUserId: string,
  timeZone: string,
  role: EmployeeRole
): Promise<{ reservations: MissionReservationInput[]; feedItems: MissionFeedItemInput[]; maintenanceJobs: MissionMaintenanceInput[]; nowIso: string }> {
  const nowIso = new Date().toISOString()
  const { fromIso, toIso } = resolveReportPeriod("today", timeZone)
  const isToday = (iso: string) => iso >= fromIso && iso < toIso
  const maintenanceType = maintenanceTypeForRole(role)

  if (maintenanceType) {
    if (isMockMode() || !supabase) {
      const maintenanceJobs: MissionMaintenanceInput[] = mockMaintenanceRecords
        .filter((m) => (maintenanceType === "cleaning" ? m.type === "cleaning" : m.type !== "cleaning"))
        .filter((m) => OPEN_MAINTENANCE_STATUSES.includes(m.status))
        .filter((m) => m.assignedEmployeeId === null || m.assignedEmployeeId === employeeUserId)
        .map((m) => ({
          id: m.id,
          vehicleLabel: m.vehicleLabel,
          type: m.type,
          priority: m.priority,
          status: m.status,
          scheduledOn: m.scheduledOn,
        }))
      return { reservations: [], feedItems: [], maintenanceJobs, nowIso }
    }

    const typeFilter =
      maintenanceType === "cleaning" ? "type.eq.cleaning" : `type.neq.cleaning`
    const { data: maintenanceRows, error: maintenanceError } = await supabase
      .from("maintenance_records")
      .select("id, type, priority, status, scheduled_on, assigned_employee_id, vehicle:vehicles(make, model)")
      .eq("company_id", companyId)
      .in("status", OPEN_MAINTENANCE_STATUSES)
      .or(`assigned_employee_id.eq.${employeeUserId},assigned_employee_id.is.null`)
      .or(typeFilter)

    if (maintenanceError) throw maintenanceError

    const maintenanceJobs: MissionMaintenanceInput[] = (maintenanceRows ?? []).map((row) => {
      const r = row as unknown as {
        id: string
        type: string
        priority: string
        status: string
        scheduled_on: string | null
        vehicle: { make: string; model: string } | null
      }
      return {
        id: r.id,
        vehicleLabel: r.vehicle ? `${r.vehicle.make} ${r.vehicle.model}` : "Unassigned vehicle",
        type: r.type,
        priority: r.priority as MissionMaintenanceInput["priority"],
        status: r.status,
        scheduledOn: r.scheduled_on,
      }
    })

    return { reservations: [], feedItems: [], maintenanceJobs, nowIso }
  }

  if (isMockMode() || !supabase) {
    const relevant = mockBookings.filter(
      (b) => RELEVANT_STATUSES.includes(b.status) && (isToday(`${b.startDate}T00:00:00.000Z`) || isToday(`${b.endDate}T00:00:00.000Z`))
    )
    const reservations: MissionReservationInput[] = relevant.map((b) => {
      const pickupInsp = mockInspections.find((i) => i.reservationId === b.id && i.type === "pickup")
      const returnInsp = mockInspections.find((i) => i.reservationId === b.id && i.type === "return")
      return {
        id: b.id,
        reference: b.reference,
        customerName: b.customer.fullName,
        vehicleLabel: b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : null,
        status: b.status,
        pickupAt: `${b.startDate}T12:00:00.000Z`,
        returnAt: `${b.endDate}T12:00:00.000Z`,
        pickupDueToday: isToday(`${b.startDate}T00:00:00.000Z`),
        returnDueToday: isToday(`${b.endDate}T00:00:00.000Z`),
        hasPickupInspection: Boolean(pickupInsp),
        hasCompletedPickupInspection: pickupInsp?.status === "completed",
        hasCompletedReturnInspection: returnInsp?.status === "completed",
        // No mock contracts data exists anywhere in this codebase today
        // (contracts are a live-Supabase-only feature, same as every
        // other AI/database-only feature since phase 06) — always false
        // here, not a gap specific to this module.
        contractAwaitingSignature: false,
      }
    })
    return { reservations, feedItems: [], maintenanceJobs: [], nowIso }
  }

  const { data: reservationRows, error } = await supabase
    .from("reservations")
    .select(
      "id, reference, status, pickup_at, return_at, assigned_employee_id, customer:customers(full_name), vehicle:vehicles(make, model)"
    )
    .eq("company_id", companyId)
    .in("status", RELEVANT_STATUSES)
    .or(`and(pickup_at.gte.${fromIso},pickup_at.lt.${toIso}),and(return_at.gte.${fromIso},return_at.lt.${toIso})`)
    .or(`assigned_employee_id.eq.${employeeUserId},assigned_employee_id.is.null`)

  if (error) throw error

  const rows = (reservationRows ?? []) as unknown as {
    id: string
    reference: string
    status: string
    pickup_at: string
    return_at: string
    customer: { full_name: string } | null
    vehicle: { make: string; model: string } | null
  }[]

  const reservationIds = rows.map((r) => r.id)

  const [{ data: inspectionRows }, { data: contractRows }, feedItems] = await Promise.all([
    reservationIds.length > 0
      ? supabase.from("inspections").select("reservation_id, type, status").eq("company_id", companyId).in("reservation_id", reservationIds)
      : Promise.resolve({ data: [] as { reservation_id: string; type: string; status: string }[] }),
    reservationIds.length > 0
      ? supabase
          .from("contracts")
          .select("reservation_id, status")
          .eq("company_id", companyId)
          .eq("status", "awaiting_signature")
          .in("reservation_id", reservationIds)
      : Promise.resolve({ data: [] as { reservation_id: string; status: string }[] }),
    getOpenOperationsFeedItems(supabase, companyId),
  ])

  const inspections = (inspectionRows ?? []) as { reservation_id: string; type: string; status: string }[]
  const awaitingSignatureIds = new Set((contractRows ?? []).map((c) => (c as { reservation_id: string }).reservation_id))

  const reservations: MissionReservationInput[] = rows.map((row) => {
    const pickupInsp = inspections.find((i) => i.reservation_id === row.id && i.type === "pickup")
    const returnInsp = inspections.find((i) => i.reservation_id === row.id && i.type === "return")
    return {
      id: row.id,
      reference: row.reference,
      customerName: row.customer?.full_name ?? "Unknown customer",
      vehicleLabel: row.vehicle ? `${row.vehicle.make} ${row.vehicle.model}` : null,
      status: row.status as MissionReservationInput["status"],
      pickupAt: row.pickup_at,
      returnAt: row.return_at,
      pickupDueToday: isToday(row.pickup_at),
      returnDueToday: isToday(row.return_at),
      hasPickupInspection: Boolean(pickupInsp),
      hasCompletedPickupInspection: pickupInsp?.status === "completed",
      hasCompletedReturnInspection: returnInsp?.status === "completed",
      contractAwaitingSignature: awaitingSignatureIds.has(row.id),
    }
  })

  const reservationIdSet = new Set(reservationIds)
  const relevantFeedItems: MissionFeedItemInput[] = feedItems
    .filter((item) => item.entityType === "reservation" && reservationIdSet.has(item.entityId))
    .map((item) => ({
      id: item.id,
      observation: item.observation,
      actionLabel: item.actionLabel,
      actionHref: item.actionHref,
      priorityTier: item.priorityTier,
    }))

  return { reservations, feedItems: relevantFeedItems, maintenanceJobs: [], nowIso }
}
