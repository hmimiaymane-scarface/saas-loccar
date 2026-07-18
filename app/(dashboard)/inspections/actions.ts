"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/activity-log"
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

    await logActivity(
      supabase,
      companyId,
      session.userId,
      type === "pickup" ? "pickup_started" : "return_started",
      `${type === "pickup" ? "Pickup" : "Return"} started`,
      null,
      { reservation_id: reservationId, inspection_id: inspection.id }
    )

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

export async function attachInspectionMedia(
  inspectionId: string,
  storagePath: string,
  originalFilename: string,
  mimeType: string,
  fileSizeBytes: number,
  caption?: string
): Promise<{ error?: string; mediaId?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...INSPECTION_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

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
