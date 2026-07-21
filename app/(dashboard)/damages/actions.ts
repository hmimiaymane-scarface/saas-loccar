"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString, optionalNumber, requiredEnum } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { recordEvent } from "@/lib/activity-log"
import { recomputeVehicleIntelligenceBestEffort } from "@/lib/vehicle-intelligence-store"
import { recomputeCustomerIntelligenceBestEffort } from "@/lib/customer-intelligence-store"
import type { DamageCategory, DamageSeverity, DamageStatus } from "@/types/rental"

const DAMAGE_ROLES = ["owner", "manager", "agent"] as const
const DAMAGE_RESOLVE_ROLES = ["owner", "manager"] as const

const CATEGORIES: DamageCategory[] = ["bodywork", "glass", "interior", "mechanical", "tyre", "electrical", "other"]
const SEVERITIES: DamageSeverity[] = ["minor", "moderate", "severe"]
const SOURCES = ["manual", "ai_detected"] as const

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

    // Roadmap phase 15 — set only when this damage started life as an
    // AI pickup/return photo comparison suggestion the employee
    // confirmed (see detectReturnDamage in inspections/actions.ts and
    // return-wizard.tsx's Damage step). Every other caller omits both,
    // which defaults to a plain 'manual' record exactly as before.
    const sourceRaw = formData.get("source")
    const source = sourceRaw && (SOURCES as readonly string[]).includes(String(sourceRaw)) ? (sourceRaw as (typeof SOURCES)[number]) : "manual"
    const aiConfidence = optionalNumber(formData, "aiConfidence")
    // Set only by the offline sync engine (roadmap phase 16,
    // lib/offline/sync.ts) replaying a queued damage report — a repeat
    // call with the same key returns the already-created row instead
    // of inserting a duplicate.
    const idempotencyKey = optionalString(formData, "idempotencyKey")

    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("damages")
        .select("id")
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()
      if (existing) return { damageId: existing.id }
    }

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
        source,
        ai_confidence: source === "ai_detected" ? aiConfidence : null,
        idempotency_key: idempotencyKey ?? null,
      })
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "damage_recorded",
      entityType: "damage",
      entityId: data.id,
      title: `Damage recorded: ${vehicleArea}`,
      description,
      metadata: { reservation_id: reservationId, damage_id: data.id, vehicle_id: vehicleId },
    })

    // Roadmap phase 06 requirement 5 — see the matching call in
    // reservations/actions.ts#completeRentalAction.
    await recomputeVehicleIntelligenceBestEffort(supabase, session, vehicleId, "damage_recorded")

    // Roadmap phase 08 requirement 6 — only when this damage is linked
    // to a reservation, since that's the only way to know which
    // customer it belongs to (damages don't carry a customer_id
    // directly). A damage recorded with no reservation (e.g. found
    // during routine inspection, not tied to a specific rental) has no
    // customer to recompute.
    if (reservationId) {
      const { data: reservation } = await supabase
        .from("reservations")
        .select("customer_id")
        .eq("id", reservationId)
        .eq("company_id", companyId)
        .maybeSingle()
      if (reservation?.customer_id) {
        await recomputeCustomerIntelligenceBestEffort(supabase, session, reservation.customer_id, "damage_recorded")
      }
    }

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

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "damage_resolved",
      entityType: "damage",
      entityId: damageId,
      title: `Damage ${nextStatus.replace("_", " ")}: ${damage.vehicle_area}`,
      metadata: { reservation_id: damage.reservation_id, damage_id: damageId, vehicle_id: damage.vehicle_id },
    })

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
