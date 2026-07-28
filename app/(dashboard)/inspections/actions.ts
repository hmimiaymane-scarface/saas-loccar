"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { recordEvent } from "@/lib/activity-log"
import { STORAGE_BUCKET, ACCEPTED_IMAGE_MIME_TYPES, validateUploadForCompany } from "@/lib/storage"
import { compareInspectionPhotos } from "@/lib/damage-detection"
import type {
  Cleanliness,
  FuelLevel,
  InspectionType,
  OverallCondition,
  ChecklistCategory,
  ChecklistResponseValue,
} from "@/types/rental"

const INSPECTION_ROLES = ["owner", "manager", "agent"] as const

export interface InspectionActionState {
  error?: string
  inspectionId?: string
}

/**
 * Starts (or resumes) the pickup/return inspection for a reservation.
 * Idempotent by design: if one already exists for this
 * (reservation, type) pair — draft or completed — it's returned instead
 * of erroring, so tapping "Start pickup" twice (e.g. a flaky connection
 * retry) never trips the DB's unique constraint.
 */
export async function startInspection(
  reservationId: string,
  type: InspectionType
): Promise<InspectionActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...INSPECTION_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select("id, vehicle_id, customer_id, status")
      .eq("company_id", companyId)
      .eq("id", reservationId)
      .maybeSingle()

    if (resError) throw new ActionError(friendlyDbError(resError))
    if (!reservation) throw new ActionError("Reservation not found.")
    if (!reservation.vehicle_id) {
      throw new ActionError("Assign a vehicle to this reservation before starting an inspection.")
    }
    if (type === "pickup" && !["confirmed", "pending", "request"].includes(reservation.status)) {
      throw new ActionError("Only a confirmed reservation can start a pickup inspection.")
    }
    if (type === "return" && reservation.status !== "active") {
      throw new ActionError("Only an active rental can start a return inspection.")
    }

    const { data: existing } = await supabase
      .from("inspections")
      .select("id")
      .eq("company_id", companyId)
      .eq("reservation_id", reservationId)
      .eq("type", type)
      .maybeSingle()

    if (existing) return { inspectionId: existing.id }

    const { data: inspection, error: insertError } = await supabase
      .from("inspections")
      .insert({
        company_id: companyId,
        reservation_id: reservationId,
        vehicle_id: reservation.vehicle_id,
        customer_id: reservation.customer_id,
        type,
      })
      .select("id")
      .single()

    if (insertError) return { error: friendlyDbError(insertError) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: type === "pickup" ? "pickup_started" : "return_started",
      entityType: "inspection",
      entityId: inspection.id,
      title: `${type === "pickup" ? "Pickup" : "Return"} started`,
      metadata: { reservation_id: reservationId, inspection_id: inspection.id },
    })

    revalidatePath(`/reservations/${reservationId}`)
    return { inspectionId: inspection.id }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export interface InspectionFieldsInput {
  odometerKm?: number
  fuelLevel?: FuelLevel
  cleanliness?: Cleanliness
  overallCondition?: OverallCondition
  notes?: string
  /** Roadmap phase 25 — required to complete a pickup inspection, see
   * complete_inspection() in 20260808090000_pickup_existing_damage_review.sql. */
  existingDamageReviewed?: boolean
}

/** Saves progress on a draft inspection — called as the employee moves
 * through the guided flow, not just once at the end, so a dropped
 * connection or an interrupted pickup never loses completed steps. */
export async function saveInspectionFields(
  inspectionId: string,
  fields: InspectionFieldsInput
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...INSPECTION_ROLES])
    const supabase = await createClient()

    const { error } = await supabase
      .from("inspections")
      .update({
        odometer_km: fields.odometerKm,
        fuel_level: fields.fuelLevel,
        cleanliness: fields.cleanliness,
        overall_condition: fields.overallCondition,
        notes: fields.notes,
        existing_damage_reviewed: fields.existingDamageReviewed,
      })
      .eq("id", inspectionId)

    if (error) return { error: friendlyDbError(error) }
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function saveChecklistResponse(
  inspectionId: string,
  itemKey: string,
  itemLabel: string,
  category: ChecklistCategory,
  response: ChecklistResponseValue,
  notes?: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...INSPECTION_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { error } = await supabase.from("inspection_checklist_responses").upsert(
      {
        company_id: companyId,
        inspection_id: inspectionId,
        item_key: itemKey,
        item_label: itemLabel,
        category,
        response,
        notes: notes ?? null,
      },
      { onConflict: "inspection_id,item_key" }
    )

    if (error) return { error: friendlyDbError(error) }
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/**
 * `idempotencyKey` (roadmap phase 16) is set only by the offline sync
 * engine (lib/offline/sync.ts) replaying a queued photo upload whose
 * server response may have been lost — a repeat call with the same key
 * returns the already-created row instead of inserting a duplicate
 * `media` record. Every other caller omits it and behaves exactly as
 * before (a plain insert, `media.idempotency_key` stays null).
 */
export async function attachInspectionMedia(
  inspectionId: string,
  storagePath: string,
  originalFilename: string,
  mimeType: string,
  fileSizeBytes: number,
  caption?: string,
  idempotencyKey?: string
): Promise<{ error?: string; mediaId?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...INSPECTION_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    // Roadmap phase 19 — see the equivalent check in
    // app/(dashboard)/documents/actions.ts#createDocumentRecord for why
    // this can't be trusted from the client alone.
    const uploadError = validateUploadForCompany(companyId, storagePath, { type: mimeType, size: fileSizeBytes }, ACCEPTED_IMAGE_MIME_TYPES)
    if (uploadError) throw new ActionError(uploadError)

    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("media")
        .select("id")
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()
      if (existing) return { mediaId: existing.id }
    }

    const { data, error } = await supabase
      .from("media")
      .insert({
        company_id: companyId,
        entity_type: "inspection",
        entity_id: inspectionId,
        storage_path: storagePath,
        original_filename: originalFilename,
        mime_type: mimeType,
        file_size_bytes: fileSizeBytes,
        caption: caption ?? null,
        uploaded_by: session.userId,
        idempotency_key: idempotencyKey ?? null,
      })
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }
    return { mediaId: data.id }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function completeInspectionAction(
  inspectionId: string,
  reservationId: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...INSPECTION_ROLES])
    const supabase = await createClient()

    const { error } = await supabase.rpc("complete_inspection", { p_inspection_id: inspectionId })
    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/reservations/${reservationId}`)
    revalidatePath(`/inspections/${inspectionId}`)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export interface DetectReturnDamageResult {
  /** Set on a hard failure (auth, no provider configured, unreadable file). */
  error?: string
  /** True when there's nothing to compare against — no pickup photo was
   * captured for this angle, or no pickup inspection exists at all. Not
   * an error: comparison is simply unavailable, same as any other
   * optional AI enrichment in this app degrading gracefully. */
  noPickupPhoto?: boolean
  damageDetected?: boolean
  confidence?: number
  description?: string
}

/**
 * Roadmap phase 15 requirement 2 — compares a just-captured return
 * inspection photo against the pickup inspection's photo of the same
 * angle. Never persists a damage record itself; the caller (the return
 * wizard's Damage step) shows the result via AiRecommendationCard and
 * only creates a damage if the employee explicitly accepts it — see
 * lib/damage-detection.ts's own doc comment for why this can't and
 * shouldn't auto-record anything.
 *
 * The pickup↔return photo join is a two-hop lookup (reservation ->
 * pickup inspection -> its media for this angle) since there's no
 * direct FK between a return photo and "the corresponding pickup
 * photo" — angle identity is `media.caption`, the same convention every
 * other reader of inspection photos already relies on.
 */
export async function detectReturnDamage(returnInspectionId: string, angle: string): Promise<DetectReturnDamageResult> {
  try {
    const session = await requireSession()
    requireRole(session, [...INSPECTION_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { data: returnInspection, error: returnError } = await supabase
      .from("inspections")
      .select("id, reservation_id, type")
      .eq("id", returnInspectionId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (returnError) throw new ActionError(friendlyDbError(returnError))
    if (!returnInspection || returnInspection.type !== "return") {
      throw new ActionError("Return inspection not found.")
    }

    const { data: pickupInspection } = await supabase
      .from("inspections")
      .select("id")
      .eq("company_id", companyId)
      .eq("reservation_id", returnInspection.reservation_id)
      .eq("type", "pickup")
      .maybeSingle()

    if (!pickupInspection) return { noPickupPhoto: true }

    const [{ data: pickupMedia }, { data: returnMedia }] = await Promise.all([
      supabase
        .from("media")
        .select("storage_path, mime_type")
        .eq("company_id", companyId)
        .eq("entity_type", "inspection")
        .eq("entity_id", pickupInspection.id)
        .eq("caption", angle)
        .maybeSingle(),
      supabase
        .from("media")
        .select("storage_path, mime_type")
        .eq("company_id", companyId)
        .eq("entity_type", "inspection")
        .eq("entity_id", returnInspectionId)
        .eq("caption", angle)
        .maybeSingle(),
    ])

    if (!pickupMedia) return { noPickupPhoto: true }
    if (!returnMedia) throw new ActionError("That return photo could not be found.")

    const [pickupDownload, returnDownload] = await Promise.all([
      supabase.storage.from(STORAGE_BUCKET).download(pickupMedia.storage_path),
      supabase.storage.from(STORAGE_BUCKET).download(returnMedia.storage_path),
    ])

    if (pickupDownload.error || !pickupDownload.data || returnDownload.error || !returnDownload.data) {
      throw new ActionError("Could not read one of the photos from storage.")
    }

    const result = await compareInspectionPhotos(
      Buffer.from(await pickupDownload.data.arrayBuffer()),
      pickupMedia.mime_type,
      Buffer.from(await returnDownload.data.arrayBuffer()),
      returnMedia.mime_type
    )

    if (!result.ok) return { error: result.message }
    return { damageDetected: result.damageDetected, confidence: result.confidence, description: result.description }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Controlled correction of a completed inspection — owner/manager only,
 * always requires a reason. See correct_inspection() in
 * supabase/migrations/20260719091100_inspection_lifecycle.sql. */
export async function correctInspectionAction(
  inspectionId: string,
  reason: string,
  fields: InspectionFieldsInput
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, ["owner", "manager"])
    const supabase = await createClient()

    const { error } = await supabase.rpc("correct_inspection", {
      p_inspection_id: inspectionId,
      p_reason: reason,
      p_odometer_km: fields.odometerKm ?? null,
      p_fuel_level: fields.fuelLevel ?? null,
      p_cleanliness: fields.cleanliness ?? null,
      p_overall_condition: fields.overallCondition ?? null,
      p_notes: fields.notes ?? null,
    })

    if (error) return { error: friendlyDbError(error) }
    revalidatePath(`/inspections/${inspectionId}`)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
