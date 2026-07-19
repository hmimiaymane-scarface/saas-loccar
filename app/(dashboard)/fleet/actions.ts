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
} from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { recordEvent } from "@/lib/activity-log"
import type { FuelType, Transmission, VehicleCategory, VehicleStatus } from "@/types/rental"

export interface VehicleActionState {
  error?: string
}

const FLEET_MANAGE_ROLES = ["owner", "manager"] as const

const VEHICLE_CATEGORIES: VehicleCategory[] = ["economy", "compact", "suv", "van", "luxury"]
const FUEL_TYPES: FuelType[] = ["petrol", "diesel", "hybrid", "electric"]
const TRANSMISSIONS: Transmission[] = ["manual", "automatic"]
const VEHICLE_STATUSES: VehicleStatus[] = ["available", "reserved", "rented", "maintenance", "unavailable"]

function readVehicleFields(formData: FormData) {
  const registrationNumber = requiredString(formData, "registrationNumber", "Registration number")
  const make = requiredString(formData, "make", "Make")
  const model = requiredString(formData, "model", "Model")
  const year = requiredNumber(formData, "year", "Year")
  const category = requiredEnum(formData, "category", VEHICLE_CATEGORIES, "Category")
  const fuelType = requiredEnum(formData, "fuelType", FUEL_TYPES, "Fuel type")
  const transmission = requiredEnum(formData, "transmission", TRANSMISSIONS, "Transmission")
  const color = optionalString(formData, "color")
  const seats = optionalNumber(formData, "seats")
  const dailyRate = requiredNumber(formData, "dailyRate", "Daily rate")
  if (dailyRate < 0) throw new ActionError("Daily rate can't be negative.")
  const depositAmount = optionalNumber(formData, "depositAmount")
  const odometerKm = optionalNumber(formData, "odometerKm") ?? 0
  const branchId = optionalString(formData, "branchId")
  const insuranceExpiresOn = optionalString(formData, "insuranceExpiresOn")
  const registrationExpiresOn = optionalString(formData, "registrationExpiresOn")
  const inspectionExpiresOn = optionalString(formData, "inspectionExpiresOn")

  return {
    registrationNumber,
    make,
    model,
    year,
    category,
    fuelType,
    transmission,
    color,
    seats,
    dailyRate,
    depositAmount,
    odometerKm,
    branchId,
    insuranceExpiresOn,
    registrationExpiresOn,
    inspectionExpiresOn,
  }
}

export async function createVehicle(
  _prevState: VehicleActionState,
  formData: FormData
): Promise<VehicleActionState> {
  let vehicleId: string | null = null

  try {
    const session = await requireSession()
    requireRole(session, [...FLEET_MANAGE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()
    const fields = readVehicleFields(formData)

    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        company_id: companyId,
        branch_id: fields.branchId,
        registration_number: fields.registrationNumber,
        make: fields.make,
        model: fields.model,
        year: fields.year,
        category: fields.category,
        fuel_type: fields.fuelType,
        transmission: fields.transmission,
        color: fields.color,
        seats: fields.seats,
        odometer_km: fields.odometerKm,
        daily_rate: fields.dailyRate,
        deposit_amount: fields.depositAmount,
        insurance_expires_on: fields.insuranceExpiresOn,
        registration_expires_on: fields.registrationExpiresOn,
        inspection_expires_on: fields.inspectionExpiresOn,
      })
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }
    vehicleId = data.id as string

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "vehicle_status_changed",
      entityType: "vehicle",
      entityId: vehicleId,
      title: `Vehicle added: ${fields.make} ${fields.model}`,
      description: `${fields.registrationNumber} added to the fleet`,
    })

    revalidatePath("/fleet")
    revalidatePath("/overview")
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }

  redirect(`/fleet/${vehicleId}`)
}

export async function updateVehicle(
  vehicleId: string,
  _prevState: VehicleActionState,
  formData: FormData
): Promise<VehicleActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...FLEET_MANAGE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()
    const fields = readVehicleFields(formData)

    const { error } = await supabase
      .from("vehicles")
      .update({
        branch_id: fields.branchId,
        registration_number: fields.registrationNumber,
        make: fields.make,
        model: fields.model,
        year: fields.year,
        category: fields.category,
        fuel_type: fields.fuelType,
        transmission: fields.transmission,
        color: fields.color,
        seats: fields.seats,
        odometer_km: fields.odometerKm,
        daily_rate: fields.dailyRate,
        deposit_amount: fields.depositAmount,
        insurance_expires_on: fields.insuranceExpiresOn,
        registration_expires_on: fields.registrationExpiresOn,
        inspection_expires_on: fields.inspectionExpiresOn,
      })
      .eq("id", vehicleId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/fleet/${vehicleId}`)
    revalidatePath("/fleet")
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }

  redirect(`/fleet/${vehicleId}`)
}

/**
 * Manual operational status changes from the Fleet page (send to
 * maintenance, mark unavailable, restore to service). Distinct from
 * `transition_reservation_status`, which flips vehicle status as a *side
 * effect* of a reservation moving through its lifecycle — this is the
 * direct owner/manager control, and refuses to fight an active rental
 * rather than silently overriding it.
 */
export async function updateVehicleStatus(
  vehicleId: string,
  nextStatus: VehicleStatus
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...FLEET_MANAGE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (!VEHICLE_STATUSES.includes(nextStatus)) {
      throw new ActionError("Invalid status.")
    }

    if (nextStatus === "maintenance" || nextStatus === "unavailable") {
      const { data: activeReservation } = await supabase
        .from("reservations")
        .select("id, reference")
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId)
        .eq("status", "active")
        .maybeSingle()

      if (activeReservation) {
        throw new ActionError(
          `This vehicle has an active rental (${activeReservation.reference}). Complete or cancel it before changing the vehicle's status.`
        )
      }
    }

    const { error } = await supabase
      .from("vehicles")
      .update({ status: nextStatus })
      .eq("id", vehicleId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "vehicle_status_changed",
      entityType: "vehicle",
      entityId: vehicleId,
      title: `Vehicle marked ${nextStatus}`,
    })

    revalidatePath(`/fleet/${vehicleId}`)
    revalidatePath("/fleet")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
