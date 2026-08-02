"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { recordEvent } from "@/lib/activity-log"
import { STORAGE_BUCKET, ACCEPTED_DOCUMENT_MIME_TYPES, validateUploadForCompany } from "@/lib/storage"
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
  /** Set only by the offline sync engine (roadmap phase 16,
   * lib/offline/sync.ts) replaying a queued upload — a repeat call
   * with the same key returns the already-created row instead of
   * inserting a duplicate. Every other caller omits it. */
  idempotencyKey?: string
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

    // Roadmap phase 19 — the browser already ran this same check (see
    // every DocumentScanCapture/DocumentUploadRow call site), but an
    // honest client is the only thing that ever enforced it before this:
    // nothing stopped a direct call to this action from recording any
    // mimeType/fileSizeBytes string. Re-validates the metadata server-
    // side; can't verify the actual uploaded bytes, since they go
    // straight browser -> Storage and this action never sees them (see
    // docs/security.md's "Document security" section for why real
    // content-sniffing would need a bigger upload-path change).
    const uploadError = validateUploadForCompany(
      companyId,
      input.storagePath,
      { type: input.mimeType, size: input.fileSizeBytes },
      ACCEPTED_DOCUMENT_MIME_TYPES
    )
    if (uploadError) throw new ActionError(uploadError)

    if (input.idempotencyKey) {
      const { data: existing } = await supabase
        .from("documents")
        .select("id")
        .eq("company_id", companyId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle()
      if (existing) return { documentId: existing.id }
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
        idempotency_key: input.idempotencyKey ?? null,
      })
      .select("id")
      .single()

    if (error) {
      // Roadmap phase 70 — the upload itself already succeeded (browser
      // -> Storage directly, before this action ever runs); if the DB
      // row then fails, the object would otherwise sit in Storage
      // forever with nothing referencing it. Best-effort only: a
      // failure here shouldn't mask the original, more important error.
      await supabase.storage.from(STORAGE_BUCKET).remove([input.storagePath])
      return { error: friendlyDbError(error) }
    }

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

/**
 * Roadmap phase 19 requirement 2 (bible Chapter 14 §9/§10 — sensitive
 * documents need who/when access logging). Unlike contracts
 * (logContractViewedAction, called server-side from the contract's own
 * detail page on render), a document has no detail page of its own —
 * DocumentListItem's link goes straight to a Storage signed URL — so
 * this has to be a client-triggered call, same convention as
 * logContractPrintedAction/logContractDownloadedAction being fired from
 * an onClick rather than a page load. Best-effort: a failed log must
 * never block the user from actually opening the document (see the
 * `.catch(() => {})` at the call site).
 */
export async function logDocumentAccess(
  documentId: string,
  action: "viewed" | "downloaded"
): Promise<void> {
  const session = await requireSession()
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from("documents")
    .select("original_filename, reservation_id, customer_id, vehicle_id")
    .eq("id", documentId)
    .eq("company_id", session.company.id)
    .maybeSingle()

  await recordEvent(supabase, {
    companyId: session.company.id,
    actorId: session.userId,
    type: action === "viewed" ? "document_viewed" : "document_downloaded",
    entityType: "document",
    entityId: documentId,
    title: `Document ${action}${doc ? `: ${doc.original_filename}` : ""}`,
    metadata: {
      ...(doc?.reservation_id ? { reservation_id: doc.reservation_id } : {}),
      ...(doc?.customer_id ? { customer_id: doc.customer_id } : {}),
      ...(doc?.vehicle_id ? { vehicle_id: doc.vehicle_id } : {}),
    },
  })
}
