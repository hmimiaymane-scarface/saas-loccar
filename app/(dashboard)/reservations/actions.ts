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
import { findCustomerByPhone, getAvailableVehicles, searchCustomers } from "@/lib/data"
import { logActivity } from "@/lib/activity-log"
import { isTerminalStatus } from "@/lib/reservations/status"
import type { BookingStatus, Customer, ReservationSource, Vehicle, VehicleCategory } from "@/types/rental"

export interface ReservationActionState {
  error?: string
  duplicateCustomer?: { id: string; fullName: string; phone: string }
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
  const dailyRate = requiredNumber(formData, "dailyRate", "Daily rate")
  if (dailyRate < 0) throw new ActionError("Daily rate can't be negative.")
  const discountMad = optionalNumber(formData, "discountMad") ?? 0
  if (discountMad < 0) throw new ActionError("Discount can't be negative.")
  const depositMad = optionalNumber(formData, "depositMad")
  const amountPaidMad = optionalNumber(formData, "amountPaidMad") ?? 0
  if (amountPaidMad < 0) throw new ActionError("Amount paid can't be negative.")
  const notes = optionalString(formData, "notes")

  const pricing = calculatePricing({ dailyRateMad: dailyRate, pickupAt, returnAt, discountMad, amountPaidMad })
  if (pricing.amountPaidMad > pricing.totalMad) {
    throw new ActionError("Amount paid can't exceed the total.")
  }

  return {
    vehicleId,
    requestedCategory,
    branchId,
    pickupAt,
    returnAt,
    pickupLocation,
    returnLocation,
    dailyRate,
    depositMad,
    notes,
    pricing,
  }
}

export async function createReservation(
  _prevState: ReservationActionState,
  formData: FormData
): Promise<ReservationActionState> {
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

      await logActivity(
        supabase,
        companyId,
        session.userId,
        "customer_created",
        "Customer added",
        `${quickCustomerName} added while creating a reservation`
      )
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
        amount_paid: shared.pricing.amountPaidMad,
        deposit_amount: shared.depositMad,
        notes: shared.notes,
        created_by: session.userId,
      })
      .select("id")
      .single()

    if (insertError) {
      return { error: friendlyDbError(insertError) }
    }

    await logActivity(
      supabase,
      companyId,
      session.userId,
      "reservation_requested",
      `Reservation ${reference} created`,
      `${shared.pricing.numDays}-day booking for ${quickCustomerName ?? "an existing customer"}`,
      { reservation_id: reservation.id }
    )

    revalidatePath("/reservations")
    revalidatePath("/calendar")
    revalidatePath("/overview")
    revalidatePath("/fleet")
    redirect(`/reservations/${reservation.id}`)
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
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
    if (isTerminalStatus(existing.status as BookingStatus)) {
      throw new ActionError(`This reservation is already ${existing.status} and can't be edited.`)
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
        amount_paid: shared.pricing.amountPaidMad,
        deposit_amount: shared.depositMad,
        notes: shared.notes,
      })
      .eq("id", reservationId)
      .eq("company_id", companyId)

    if (updateError) {
      return { error: friendlyDbError(updateError) }
    }

    await logActivity(
      supabase,
      companyId,
      session.userId,
      "reservation_updated",
      "Reservation updated",
      null,
      { reservation_id: reservationId }
    )

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

export async function checkCustomerByPhone(phone: string): Promise<Customer | null> {
  const session = await requireSession()
  if (!phone.trim()) return null
  return findCustomerByPhone(session.company.id, phone)
}

export async function fetchCustomers(query: string): Promise<Customer[]> {
  const session = await requireSession()
  return searchCustomers(session.company.id, query)
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
