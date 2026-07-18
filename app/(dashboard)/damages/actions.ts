"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString, optionalNumber, requiredEnum } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/activity-log"
import type { DamageCategory, DamageSeverity, DamageStatus } from "@/types/rental"

const DAMAGE_ROLES = ["owner", "manager", "agent"] as const
const DAMAGE_RESOLVE_ROLES = ["owner", "manager"] as const

const CATEGORIES: DamageCategory[] = ["bodywork", "glass", "interior", "mechanical", "tyre", "electrical", "other"]
const SEVERITIES: DamageSeverity[] = ["minor", "moderate", "severe"]

export interface DamageActionState {
  error?: string
  damageId?: string
}

export async function createDamage(
  _prevState: DamageActionState,
  formData: FormData
): Promise<DamageActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...DAMAGE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const vehicleId = requiredString(formData, "vehicleId", "Vehicle")
    const reservationId = optionalString(formData, "reservationId")
    const discoveredInInspectionId = optionalString(formData, "discoveredInInspectionId")
    const category = requiredEnum(formData, "category", CATEGORIES, "Category")
    const severity = requiredEnum(formData, "severity", SEVERITIES, "Severity")
    const vehicleArea = requiredString(formData, "vehicleArea", "Vehicle area")
    const description = requiredString(formData, "description", "Description")
    const preExisting = formData.get("preExisting") === "true"
    const estimatedCost = optionalNumber(formData, "estimatedCost")
    if (estimatedCost != null && estimatedCost < 0) throw new ActionError("Estimated cost can't be negative.")

    const { data, error } = await supabase
      .from("damages")
      .insert({
        company_id: companyId,
        vehicle_id: vehicleId,
        reservation_id: reservationId,
        discovered_in_inspection_id: discoveredInInspectionId,
        status: preExisting ? "existing" : "newly_discovered",
        category,
        severity,
        vehicle_area: vehicleArea,
        description,
        pre_existing: preExisting,
        estimated_cost: estimatedCost,
        created_by: session.userId,
      })
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }

    await logActivity(
      supabase,
      companyId,
      session.userId,
      "damage_recorded",
      `Damage recorded: ${vehicleArea}`,
      description,
      { reservation_id: reservationId, damage_id: data.id }
    )

    if (reservationId) revalidatePath(`/reservations/${reservationId}`)
    revalidatePath(`/fleet/${vehicleId}`)
    revalidatePath(`/damages/${data.id}`)
    return { damageId: data.id }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function updateDamage(
  damageId: string,
  _prevState: DamageActionState,
  formData: FormData
): Promise<DamageActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...DAMAGE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const category = requiredEnum(formData, "category", CATEGORIES, "Category")
    const severity = requiredEnum(formData, "severity", SEVERITIES, "Severity")
    const vehicleArea = requiredString(formData, "vehicleArea", "Vehicle area")
    const description = requiredString(formData, "description", "Description")
    const estimatedCost = optionalNumber(formData, "estimatedCost")

    const { error } = await supabase
      .from("damages")
      .update({ category, severity, vehicle_area: vehicleArea, description, estimated_cost: estimatedCost })
      .eq("id", damageId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/damages/${damageId}`)
    return { damageId }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Resolution changes (moving a damage toward closed, setting an actual
 * repair cost) are owner/manager only — an agent can open a damage but
 * not decide who's responsible or that it's closed. */
export async function resolveDamage(
  damageId: string,
  nextStatus: DamageStatus,
  actualCost?: number
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...DAMAGE_RESOLVE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (actualCost != null && actualCost < 0) throw new ActionError("Actual cost can't be negative.")

    const { data: damage, error: updateError } = await supabase
      .from("damages")
      .update({ status: nextStatus, actual_cost: actualCost })
      .eq("id", damageId)
      .eq("company_id", companyId)
      .select("vehicle_area, reservation_id, vehicle_id")
      .single()

    if (updateError) return { error: friendlyDbError(updateError) }

    await logActivity(
      supabase,
      companyId,
      session.userId,
      "damage_resolved",
      `Damage ${nextStatus.replace("_", " ")}: ${damage.vehicle_area}`,
      null,
      { reservation_id: damage.reservation_id, damage_id: damageId }
    )

    revalidatePath(`/damages/${damageId}`)
    if (damage.reservation_id) revalidatePath(`/reservations/${damage.reservation_id}`)
    revalidatePath(`/fleet/${damage.vehicle_id}`)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function attachDamageMedia(
  damageId: string,
  storagePath: string,
  originalFilename: string,
  mimeType: string,
  fileSizeBytes: number,
  caption?: string
): Promise<{ error?: string; mediaId?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...DAMAGE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("media")
      .insert({
        company_id: companyId,
        entity_type: "damage",
        entity_id: damageId,
        storage_path: storagePath,
        original_filename: originalFilename,
        mime_type: mimeType,
        file_size_bytes: fileSizeBytes,
        caption: caption ?? null,
        uploaded_by: session.userId,
      })
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }
    revalidatePath(`/damages/${damageId}`)
    return { mediaId: data.id }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
