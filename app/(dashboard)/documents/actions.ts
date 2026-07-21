"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { recordEvent } from "@/lib/activity-log"
import { STORAGE_BUCKET } from "@/lib/storage"
import { findSupersededDocument } from "@/lib/documents"
import type { DocumentCategory } from "@/types/rental"

const DOCUMENT_ROLES = ["owner", "manager", "agent"] as const

export interface CreateDocumentInput {
  category: DocumentCategory
  storagePath: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  reservationId?: string
  customerId?: string
  vehicleId?: string
  contractReference?: string
  notes?: string
}

export async function createDocumentRecord(
  input: CreateDocumentInput
): Promise<{ error?: string; documentId?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...DOCUMENT_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (!input.reservationId && !input.customerId && !input.vehicleId) {
      throw new ActionError("A document must be linked to a reservation, customer or vehicle.")
    }

    // Version chaining (roadmap phase 04 requirement 3): if this same
    // entity already has an active document of this category, the new
    // upload supersedes it rather than leaving two "active" rows for
    // the same thing — the old one is flipped to 'replaced' below, never
    // deleted, so it stays retrievable via getDocumentVersionHistory().
    const supersededId = await findSupersededDocument(supabase, companyId, {
      category: input.category,
      reservationId: input.reservationId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
    })

    const { data, error } = await supabase
      .from("documents")
      .insert({
        company_id: companyId,
        reservation_id: input.reservationId ?? null,
        customer_id: input.customerId ?? null,
        vehicle_id: input.vehicleId ?? null,
        category: input.category,
        storage_path: input.storagePath,
        original_filename: input.originalFilename,
        mime_type: input.mimeType,
        file_size_bytes: input.fileSizeBytes,
        contract_reference: input.contractReference ?? null,
        notes: input.notes ?? null,
        uploaded_by: session.userId,
        replaces_document_id: supersededId,
      })
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }

    if (supersededId) {
      await supabase
        .from("documents")
        .update({ status: "replaced" })
        .eq("id", supersededId)
        .eq("company_id", companyId)
    }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "document_uploaded",
      entityType: "document",
      entityId: data.id,
      title: `Document uploaded: ${input.originalFilename}`,
      metadata: {
        ...(input.reservationId ? { reservation_id: input.reservationId } : {}),
        ...(input.customerId ? { customer_id: input.customerId } : {}),
        ...(input.vehicleId ? { vehicle_id: input.vehicleId } : {}),
        ...(supersededId ? { replaces_document_id: supersededId } : {}),
      },
    })

    if (input.reservationId) revalidatePath(`/reservations/${input.reservationId}`)
    if (input.customerId) revalidatePath(`/customers/${input.customerId}`)
    if (input.vehicleId) revalidatePath(`/fleet/${input.vehicleId}`)
    revalidatePath("/documents")

    return { documentId: data.id }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Soft-deletes the database record and removes the underlying file.
 * Deletion is owner/manager only — matches "unauthorized roles cannot
 * delete completed evidence" from the phase brief. */
export async function deleteDocument(documentId: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, ["owner", "manager"])
    const companyId = session.company.id
    const supabase = await createClient()

    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("storage_path, reservation_id, customer_id, vehicle_id")
      .eq("id", documentId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (fetchError) throw new ActionError(friendlyDbError(fetchError))
    if (!doc) throw new ActionError("Document not found.")

    const { error: updateError } = await supabase
      .from("documents")
      .update({ status: "deleted" })
      .eq("id", documentId)
      .eq("company_id", companyId)

    if (updateError) return { error: friendlyDbError(updateError) }

    await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path])

    if (doc.reservation_id) revalidatePath(`/reservations/${doc.reservation_id}`)
    if (doc.customer_id) revalidatePath(`/customers/${doc.customer_id}`)
    if (doc.vehicle_id) revalidatePath(`/fleet/${doc.vehicle_id}`)
    revalidatePath("/documents")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
