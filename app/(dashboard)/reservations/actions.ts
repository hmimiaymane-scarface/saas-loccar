"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import {
  requiredString,
  optionalString,
  requiredNumber,
  optionalNumber,
  requiredEnum,
  requiredIsoDateTime,
} from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { calculatePricing } from "@/lib/pricing"
import { findCustomerByPhone, getAvailableVehicles, getVehicleSelectionOptions, searchCustomers, type VehicleSelectionOption } from "@/lib/data"
import { recordEvent } from "@/lib/activity-log"
import { isEditableStatus } from "@/lib/reservations/status"
import { recomputeVehicleIntelligenceBestEffort } from "@/lib/vehicle-intelligence-store"
import { recomputeCustomerIntelligenceBestEffort } from "@/lib/customer-intelligence-store"
import { notify } from "@/lib/notifications/service"
import { getOwnerManagerRecipients } from "@/lib/notifications/recipients"
import { logOperationalEvent } from "@/lib/observability/log"
import { SEARCH_SLOW_MS } from "@/lib/platform/launch-gate"
import type { BookingStatus, Customer, ReservationSource, Vehicle, VehicleCategory } from "@/types/rental"

export interface ReservationActionState {
  error?: string
  duplicateCustomer?: { id: string; fullName: string; phone: string }
  /** Productization wave 3 phase 18 — set only by the no-redirect
   * wizard variant below (`createReservationInWizard`); `createReservation`
   * itself never populates this, since it redirects on success instead. */
  reservationId?: string
}

const VEHICLE_CATEGORIES: VehicleCategory[] = ["economy", "compact", "suv", "van", "luxury"]
const RESERVATION_SOURCES: ReservationSource[] = ["walk_in", "phone", "whatsapp", "website", "partner", "other"]
const INITIAL_STATUSES: BookingStatus[] = ["request", "pending", "confirmed"]
const RESERVATION_ROLES = ["owner", "manager", "agent"] as const

function readSharedFields(formData: FormData, timeZone: string) {
  const vehicleId = optionalString(formData, "vehicleId")
  const requestedCategory = optionalString(formData, "requestedCategory") as VehicleCategory | null
  if (!vehicleId && !requestedCategory) {
    throw new ActionError("Choose a vehicle, or a category if none is assigned yet.")
  }
  if (requestedCategory && !VEHICLE_CATEGORIES.includes(requestedCategory)) {
    throw new ActionError("Invalid vehicle category.")
  }

  const branchId = optionalString(formData, "branchId")
  const pickupAt = requiredIsoDateTime(formData, "pickupAt", timeZone, "Pickup date and time")
  const returnAt = requiredIsoDateTime(formData, "returnAt", timeZone, "Return date and time")
  if (new Date(returnAt).getTime() <= new Date(pickupAt).getTime()) {
    throw new ActionError("Return must be after pickup.")
  }

  const pickupLocation = optionalString(formData, "pickupLocation")
  const returnLocation = optionalString(formData, "returnLocation")
  // Roadmap phase 16 — who's doing this reservation's pickup/return in
  // the field (lib/mobile/mission-feed.ts's "my work today"). Optional;
  // an unassigned reservation stays visible to any agent, unchanged
  // from every reservation's behavior before this field existed.
  const assignedEmployeeId = optionalString(formData, "assignedEmployeeId")
  const dailyRate = requiredNumber(formData, "dailyRate", "Daily rate")
  if (dailyRate < 0) throw new ActionError("Daily rate can't be negative.")
  const discountMad = optionalNumber(formData, "discountMad") ?? 0
  if (discountMad < 0) throw new ActionError("Discount can't be negative.")
  const notes = optionalString(formData, "notes")

  // amount_paid is not settable here — it's a trigger-maintained sum of
  // rental_payment transactions in `payments` (see
  // supabase/migrations/20260719090600_payments_ledger.sql). Recording a
  // payment is a separate action, available from the reservation detail
  // page and the pickup/return workflow.
  const pricing = calculatePricing({ dailyRateMad: dailyRate, pickupAt, returnAt, discountMad })

  return {
    vehicleId,
    requestedCategory,
    branchId,
    pickupAt,
    returnAt,
    pickupLocation,
    returnLocation,
    assignedEmployeeId,
    dailyRate,
    notes,
    pricing,
  }
}

/**
 * Roadmap phase 44 — unlike the reminder cron's conditions (state
 * recomputed on a schedule), a new booking request is a genuine
 * one-off event with no ongoing state to re-derive — matches
 * `notifications`'s own "genuine one-off events" category exactly
 * (see that table's migration comment), so this goes through both
 * `in_app` (a real stored row is correct here) and `push`. Best-effort:
 * a push failure must never turn a successful reservation creation
 * into an error response, same convention as
 * `recomputeVehicleIntelligenceBestEffort`.
 */
async function notifyNewBookingRequestBestEffort(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  reference: string,
  reservationId: string
): Promise<void> {
  try {
    const recipients = await getOwnerManagerRecipients(supabase, companyId)
    if (recipients.length === 0) return
    const href = `/reservations/${reservationId}`
    await notify({
      companyId,
      type: "booking_request_received",
      priority: "important",
      title: `New booking request: ${reference}`,
      description: "A new reservation request needs review.",
      linkHref: href,
      actions: [{ label: "Open request", href, kind: "link" }],
      recipients,
      channels: ["in_app", "push"],
    })
  } catch {
    // Best-effort — see doc comment above.
  }
}

/**
 * Productization wave 3 phase 18 — the shared insert logic both
 * `createReservation` (redirects on success) and
 * `createReservationInWizard` (returns the id instead, so
 * `NewRentalWizard` can continue on the same page without a redirect)
 * call — identical up through the activity-log event and cache
 * revalidation, differing only in what happens after success.
 * `requireSession`/`requireRole` stay inside this one try/catch (not
 * split across the two exported wrappers) so an `ActionError` from
 * either is still turned into `{error}` exactly as before this
 * refactor, not left to propagate as an unhandled throw.
 */
async function insertReservation(formData: FormData, redirectOnSuccess: boolean): Promise<ReservationActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...RESERVATION_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    let customerId = optionalString(formData, "customerId")
    let quickCustomerName: string | null = null

    if (!customerId) {
      quickCustomerName = requiredString(formData, "quickCustomerName", "Customer name")
      const quickPhone = requiredString(formData, "quickCustomerPhone", "Customer phone")

      const existing = await findCustomerByPhone(companyId, quickPhone)
      if (existing) {
        return {
          error: "A customer with this phone number already exists.",
          duplicateCustomer: { id: existing.id, fullName: existing.fullName, phone: existing.phone },
        }
      }

      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({ company_id: companyId, full_name: quickCustomerName, phone: quickPhone })
        .select("id")
        .single()

      if (customerError) throw new ActionError(friendlyDbError(customerError))
      customerId = newCustomer.id as string

      await recordEvent(supabase, {
        companyId,
        actorId: session.userId,
        type: "customer_created",
        entityType: "customer",
        entityId: customerId,
        title: "Customer added",
        description: `${quickCustomerName} added while creating a reservation`,
      })
    }

    const shared = readSharedFields(formData, session.company.timezone)
    const source = requiredEnum(formData, "source", RESERVATION_SOURCES, "Source")
    const status = requiredEnum(formData, "status", INITIAL_STATUSES, "Status")

    const { data: reference, error: refError } = await supabase.rpc("next_reservation_reference", {
      target_company_id: companyId,
    })
    if (refError) throw new ActionError(friendlyDbError(refError))

    const { data: reservation, error: insertError } = await supabase
      .from("reservations")
      .insert({
        company_id: companyId,
        branch_id: shared.branchId,
        customer_id: customerId,
        vehicle_id: shared.vehicleId,
        requested_category: shared.vehicleId ? null : shared.requestedCategory,
        reference: reference as string,
        pickup_at: shared.pickupAt,
        return_at: shared.returnAt,
        pickup_location: shared.pickupLocation,
        return_location: shared.returnLocation,
        status,
        source,
        daily_rate: shared.dailyRate,
        num_days: shared.pricing.numDays,
        discount_amount: shared.pricing.discountMad,
        total_amount: shared.pricing.totalMad,
        notes: shared.notes,
        assigned_employee_id: shared.assignedEmployeeId,
        created_by: session.userId,
      })
      .select("id")
      .single()

    if (insertError) {
      return { error: friendlyDbError(insertError) }
    }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "reservation_requested",
      entityType: "reservation",
      entityId: reservation.id,
      title: `Reservation ${reference} created`,
      description: `${shared.pricing.numDays}-day booking for ${quickCustomerName ?? "an existing customer"}`,
      metadata: { reservation_id: reservation.id },
    })

    if (status === "request") {
      await notifyNewBookingRequestBestEffort(supabase, companyId, reference, reservation.id as string)
    }

    revalidatePath("/reservations")
    revalidatePath("/calendar")
    revalidatePath("/overview")
    revalidatePath("/fleet")
    if (redirectOnSuccess) redirect(`/reservations/${reservation.id}`)
    return { reservationId: reservation.id as string }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function createReservation(
  _prevState: ReservationActionState,
  formData: FormData
): Promise<ReservationActionState> {
  return insertReservation(formData, true)
}

/** Productization wave 3 phase 18 — `NewRentalWizard`'s Step 2 uses
 * this instead of `createReservation` so creating the reservation
 * advances the wizard to the next step on the same page rather than
 * navigating to the reservation detail page. */
export async function createReservationInWizard(
  _prevState: ReservationActionState,
  formData: FormData
): Promise<ReservationActionState> {
  return insertReservation(formData, false)
}

export async function updateReservation(
  reservationId: string,
  _prevState: ReservationActionState,
  formData: FormData
): Promise<ReservationActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...RESERVATION_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { data: existing, error: fetchError } = await supabase
      .from("reservations")
      .select("status")
      .eq("id", reservationId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (fetchError) throw new ActionError(friendlyDbError(fetchError))
    if (!existing) throw new ActionError("Reservation not found.")
    if (!isEditableStatus(existing.status as BookingStatus)) {
      throw new ActionError(`A ${existing.status} reservation can't be edited this way.`)
    }

    const shared = readSharedFields(formData, session.company.timezone)

    const { error: updateError } = await supabase
      .from("reservations")
      .update({
        branch_id: shared.branchId,
        vehicle_id: shared.vehicleId,
        requested_category: shared.vehicleId ? null : shared.requestedCategory,
        pickup_at: shared.pickupAt,
        return_at: shared.returnAt,
        pickup_location: shared.pickupLocation,
        return_location: shared.returnLocation,
        daily_rate: shared.dailyRate,
        num_days: shared.pricing.numDays,
        discount_amount: shared.pricing.discountMad,
        total_amount: shared.pricing.totalMad,
        notes: shared.notes,
        assigned_employee_id: shared.assignedEmployeeId,
      })
      .eq("id", reservationId)
      .eq("company_id", companyId)

    if (updateError) {
      return { error: friendlyDbError(updateError) }
    }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "reservation_updated",
      entityType: "reservation",
      entityId: reservationId,
      title: "Reservation updated",
      metadata: { reservation_id: reservationId },
    })

    revalidatePath(`/reservations/${reservationId}`)
    revalidatePath("/reservations")
    revalidatePath("/calendar")
    revalidatePath("/fleet")
    redirect(`/reservations/${reservationId}`)
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function updateReservationStatus(
  reservationId: string,
  nextStatus: BookingStatus
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...RESERVATION_ROLES])
    const supabase = await createClient()

    const { error } = await supabase.rpc("transition_reservation_status", {
      p_reservation_id: reservationId,
      p_next_status: nextStatus,
    })

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/reservations/${reservationId}`)
    revalidatePath("/reservations")
    revalidatePath("/calendar")
    revalidatePath("/fleet")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Starting a rental is gated: the DB function requires an assigned
 * vehicle and a completed pickup inspection, and only lets an owner/
 * manager override that with a mandatory reason. See activate_rental() in
 * supabase/migrations/20260719091000_gated_rental_transitions.sql. */
export async function activateRentalAction(
  reservationId: string,
  overrideReason?: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...RESERVATION_ROLES])
    const supabase = await createClient()

    const { error } = await supabase.rpc("activate_rental", {
      p_reservation_id: reservationId,
      p_override_reason: overrideReason || null,
    })

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/reservations/${reservationId}`)
    revalidatePath("/reservations")
    revalidatePath("/fleet")
    revalidatePath("/calendar")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Completing a rental is gated the same way — a completed return
 * inspection and a resolved balance, or an owner/manager override. The
 * vehicle's next status is an explicit choice the caller makes here, not
 * inferred. See complete_rental() in the same migration. */
export async function completeRentalAction(
  reservationId: string,
  vehicleOutcome: "available" | "maintenance" | "unavailable",
  overrideReason?: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...RESERVATION_ROLES])
    const supabase = await createClient()

    const { error } = await supabase.rpc("complete_rental", {
      p_reservation_id: reservationId,
      p_vehicle_outcome: vehicleOutcome,
      p_override_reason: overrideReason || null,
    })

    if (error) return { error: friendlyDbError(error) }

    // Roadmap phase 06 requirement 5 / phase 08 requirement 6: recompute
    // this vehicle's and this customer's scores now that a rental just
    // completed, rather than on every future page view. complete_rental
    // only takes the reservation id, not the vehicle/customer id, so
    // look them up — best-effort, never fails the completion itself.
    const { data: completedReservation } = await supabase
      .from("reservations")
      .select("vehicle_id, customer_id")
      .eq("id", reservationId)
      .eq("company_id", session.company.id)
      .maybeSingle()
    if (completedReservation?.vehicle_id) {
      await recomputeVehicleIntelligenceBestEffort(supabase, session, completedReservation.vehicle_id, "vehicle_returned")
    }
    if (completedReservation?.customer_id) {
      await recomputeCustomerIntelligenceBestEffort(supabase, session, completedReservation.customer_id, "vehicle_returned")
    }

    revalidatePath(`/reservations/${reservationId}`)
    revalidatePath("/reservations")
    revalidatePath("/fleet")
    revalidatePath("/calendar")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function checkCustomerByPhone(phone: string): Promise<Customer | null> {
  const session = await requireSession()
  if (!phone.trim()) return null
  return findCustomerByPhone(session.company.id, phone)
}

/** Roadmap phase 66 (Launch Performance Gate) — "search" is one of
 * the 9 named launch-readiness areas; this is the one real server
 * round trip the customer-search combobox (New Rental wizard,
 * reservation form) makes per keystroke, timed so a regression here
 * is visible on /platform/operations. */
export async function fetchCustomers(query: string): Promise<Customer[]> {
  const session = await requireSession()
  const startedAt = Date.now()
  const results = await searchCustomers(session.company.id, query)
  const durationMs = Date.now() - startedAt
  if (durationMs > SEARCH_SLOW_MS) {
    void logOperationalEvent({
      source: "search",
      severity: "warning",
      context: "fetchCustomers",
      message: `Customer search took ${durationMs}ms`,
      durationMs,
    })
  }
  return results
}

export async function fetchAvailableVehicles(
  pickupAt: string,
  returnAt: string,
  category?: string,
  excludeReservationId?: string
): Promise<Vehicle[]> {
  const session = await requireSession()
  if (!pickupAt || !returnAt) return []
  return getAvailableVehicles(session.company.id, {
    pickupAt,
    returnAt,
    category: (category || undefined) as VehicleCategory | undefined,
    excludeReservationId,
  })
}

/** Productization wave 3 phase 23 — the reservation form's vehicle
 * picker needs to show *why* a vehicle can't be picked, not just the
 * available subset fetchAvailableVehicles above returns. */
export async function fetchVehicleSelectionOptions(
  pickupAt: string,
  returnAt: string,
  category?: string,
  excludeReservationId?: string
): Promise<VehicleSelectionOption[]> {
  const session = await requireSession()
  if (!pickupAt || !returnAt) return []
  return getVehicleSelectionOptions(session.company.id, {
    pickupAt,
    returnAt,
    category: (category || undefined) as VehicleCategory | undefined,
    excludeReservationId,
  })
}
