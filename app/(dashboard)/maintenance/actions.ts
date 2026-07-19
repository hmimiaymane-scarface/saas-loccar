"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString, optionalNumber, requiredEnum } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { getUpcomingReservationConflicts } from "@/lib/data"
import type {
  MaintenancePriority,
  MaintenanceRecordStatus,
  MaintenanceType,
  ReservationConflict,
  VehicleStatus,
} from "@/types/rental"

const MAINTENANCE_ROLES = ["owner", "manager"] as const

const TYPES: MaintenanceType[] = [
  "oil_change",
  "tire",
  "brake",
  "battery",
  "engine",
  "transmission",
  "air_conditioning",
  "bodywork",
  "cleaning",
  "inspection",
  "insurance_renewal",
  "registration_renewal",
  "routine_service",
  "repair",
  "other",
]
const PRIORITIES: MaintenancePriority[] = ["low", "normal", "high", "urgent"]
const CREATE_STATUSES: MaintenanceRecordStatus[] = ["planned", "scheduled", "in_progress"]
const VEHICLE_OUTCOMES: VehicleStatus[] = ["available", "maintenance", "unavailable"]

export interface MaintenanceActionState {
  error?: string
  maintenanceId?: string
}

export async function createMaintenance(
  _prevState: MaintenanceActionState,
  formData: FormData
): Promise<MaintenanceActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...MAINTENANCE_ROLES])
    const supabase = await createClient()

    const vehicleId = requiredString(formData, "vehicleId", "Vehicle")
    const type = requiredEnum(formData, "type", TYPES, "Category")
    const priority = requiredEnum(formData, "priority", PRIORITIES, "Priority")
    const status = requiredEnum(formData, "status", CREATE_STATUSES, "Status")
    const description = optionalString(formData, "description")
    const scheduledOn = optionalString(formData, "scheduledOn")
    const odometerKm = optionalNumber(formData, "odometerKm")
    const estimatedCost = optionalNumber(formData, "estimatedCost")
    if (estimatedCost != null && estimatedCost < 0) throw new ActionError("Estimated cost can't be negative.")
    const supplier = optionalString(formData, "supplier")
    const notes = optionalString(formData, "notes")

    const { data, error } = await supabase.rpc("create_maintenance", {
      p_vehicle_id: vehicleId,
      p_type: type,
      p_priority: priority,
      p_status: status,
      p_description: description,
      p_scheduled_on: scheduledOn,
      p_odometer_km: odometerKm,
      p_estimated_cost: estimatedCost,
      p_supplier: supplier,
      p_notes: notes,
    })

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/maintenance")
    revalidatePath(`/fleet/${vehicleId}`)
    revalidatePath("/overview")
    return { maintenanceId: data.id }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Non-status field edits only — category, priority, description, and so
 * on. Anything that also has to move the vehicle's status (starting,
 * completing, cancelling) goes through the dedicated RPC-backed actions
 * below instead, never a plain update. */
export async function updateMaintenance(
  maintenanceId: string,
  _prevState: MaintenanceActionState,
  formData: FormData
): Promise<MaintenanceActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...MAINTENANCE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const type = requiredEnum(formData, "type", TYPES, "Category")
    const priority = requiredEnum(formData, "priority", PRIORITIES, "Priority")
    const description = optionalString(formData, "description")
    const scheduledOn = optionalString(formData, "scheduledOn")
    const odometerKm = optionalNumber(formData, "odometerKm")
    const estimatedCost = optionalNumber(formData, "estimatedCost")
    if (estimatedCost != null && estimatedCost < 0) throw new ActionError("Estimated cost can't be negative.")
    const supplier = optionalString(formData, "supplier")
    const notes = optionalString(formData, "notes")

    const { error } = await supabase
      .from("maintenance_records")
      .update({
        type,
        priority,
        description,
        scheduled_on: scheduledOn,
        odometer_km: odometerKm,
        estimated_cost: estimatedCost,
        supplier,
        notes,
      })
      .eq("id", maintenanceId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/maintenance/${maintenanceId}`)
    revalidatePath("/maintenance")
    return { maintenanceId }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function startMaintenanceAction(maintenanceId: string, vehicleId: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...MAINTENANCE_ROLES])
    const supabase = await createClient()

    const { error } = await supabase.rpc("start_maintenance", { p_maintenance_id: maintenanceId })
    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/maintenance/${maintenanceId}`)
    revalidatePath("/maintenance")
    revalidatePath(`/fleet/${vehicleId}`)
    revalidatePath("/fleet")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function completeMaintenanceAction(
  maintenanceId: string,
  vehicleId: string,
  vehicleOutcome: VehicleStatus,
  options: {
    actualCost?: number
    nextServiceOn?: string
    nextServiceOdometerKm?: number
    createExpense?: boolean
  } = {}
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...MAINTENANCE_ROLES])
    const supabase = await createClient()

    if (!VEHICLE_OUTCOMES.includes(vehicleOutcome)) throw new ActionError("Invalid vehicle outcome.")
    if (options.actualCost != null && options.actualCost < 0) {
      throw new ActionError("Actual cost can't be negative.")
    }

    const { error } = await supabase.rpc("complete_maintenance", {
      p_maintenance_id: maintenanceId,
      p_vehicle_outcome: vehicleOutcome,
      p_actual_cost: options.actualCost,
      p_next_service_on: options.nextServiceOn,
      p_next_service_odometer_km: options.nextServiceOdometerKm,
      p_create_expense: options.createExpense ?? true,
    })
    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/maintenance/${maintenanceId}`)
    revalidatePath("/maintenance")
    revalidatePath(`/fleet/${vehicleId}`)
    revalidatePath("/fleet")
    revalidatePath("/expenses")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function cancelMaintenanceAction(
  maintenanceId: string,
  vehicleId: string,
  vehicleOutcome?: VehicleStatus
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...MAINTENANCE_ROLES])
    const supabase = await createClient()

    if (vehicleOutcome && !VEHICLE_OUTCOMES.includes(vehicleOutcome)) {
      throw new ActionError("Invalid vehicle outcome.")
    }

    const { error } = await supabase.rpc("cancel_maintenance", {
      p_maintenance_id: maintenanceId,
      p_vehicle_outcome: vehicleOutcome ?? null,
    })
    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/maintenance/${maintenanceId}`)
    revalidatePath("/maintenance")
    revalidatePath(`/fleet/${vehicleId}`)
    revalidatePath("/fleet")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Surfaced live in the create form once a vehicle is chosen, so the
 * person scheduling maintenance sees what it might affect before
 * confirming — never used to silently touch a reservation. */
export async function fetchVehicleConflicts(vehicleId: string): Promise<ReservationConflict[]> {
  if (!vehicleId) return []
  const session = await requireSession()
  return getUpcomingReservationConflicts(session.company.id, vehicleId)
}

export async function attachMaintenanceReceipt(
  maintenanceId: string,
  storagePath: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...MAINTENANCE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { error } = await supabase
      .from("maintenance_records")
      .update({ receipt_path: storagePath })
      .eq("id", maintenanceId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/maintenance/${maintenanceId}`)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
