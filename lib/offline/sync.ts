import { saveInspectionFields, attachInspectionMedia, completeInspectionAction } from "@/app/(dashboard)/inspections/actions"
import { createDamage } from "@/app/(dashboard)/damages/actions"
import { createDocumentRecord, type CreateDocumentInput } from "@/app/(dashboard)/documents/actions"
import { addSignatureAction } from "@/app/(dashboard)/contract-templates/actions"
import { uploadFile } from "@/lib/storage-client"
import { buildStoragePath } from "@/lib/storage"
import { listMutations, getBlob, updateMutation, removeMutation, type QueuedMutation } from "@/lib/offline/db"

/**
 * Roadmap phase 16 requirement 6 — drains lib/offline/db.ts's queue by
 * calling the exact same server actions a live, online interaction
 * would call. No parallel data path: a synced mutation produces the
 * identical row a direct call would have.
 *
 * Three outcomes per mutation, each handled differently on purpose:
 *  - Real success (or a harmless "this was already applied" replay,
 *    e.g. re-completing an already-completed inspection) -> removed
 *    from the queue.
 *  - A thrown exception (fetch failure — genuinely offline, or the dev
 *    server/network dropped mid-call) -> left as 'pending', retried on
 *    the next sync pass; the WHOLE pass stops here, since if one call
 *    couldn't reach the network none of the rest can either.
 *  - A real, deliberate rejection from the server action itself (a
 *    validation error, a genuine conflict) -> moved to 'needs_review'.
 *    Never silently dropped and never silently overwritten — a human
 *    looks at it. This is intentionally rare: inspections are
 *    single-operator drafts, so most sync-time conflicts are the
 *    harmless "already applied" replay case above, not a real fight
 *    over the same data.
 */
export interface SyncResult {
  synced: number
  needsReview: number
  stillPending: number
}

/** Pure, exported for unit testing without needing IndexedDB/network
 * mocking — the one piece of real judgment in an otherwise mechanical
 * dispatch loop: is this rejection actually harmless (the mutation was
 * already applied, e.g. by an earlier sync attempt whose response got
 * lost before this device saw it) or a genuine conflict a human should
 * see? */
export function isAlreadyAppliedMessage(message: string): boolean {
  return /already completed/i.test(message)
}

/** Pure — a mutation is ready to attempt once every id it depends on
 * is either already resolved (no longer in `allMutations` at all,
 * meaning a prior pass synced and removed it) or explicitly marked
 * done in this pass (`doneIds`). A dependency still sitting in
 * `allMutations` and not yet in `doneIds` blocks this mutation from
 * running out of order. */
export function isMutationReady(dependsOn: string[], allMutations: { id: string }[], doneIds: Set<string>): boolean {
  return dependsOn.every((depId) => doneIds.has(depId) || !allMutations.some((m) => m.id === depId))
}

async function resolveStoragePath(companyId: string, mutation: QueuedMutation, segments: string[]): Promise<{ path: string; error?: string } | null> {
  const blob = await getBlob(mutation.id)
  if (!blob) return null
  const path = buildStoragePath(companyId, segments, blob.fileName)
  const upload = await uploadFile(path, new File([blob.blob], blob.fileName, { type: blob.mimeType }))
  return upload.error ? { path, error: upload.error } : { path }
}

async function runMutation(companyId: string, mutation: QueuedMutation): Promise<{ ok: true } | { ok: false; retry: boolean; message: string }> {
  switch (mutation.type) {
    case "saveInspectionFields": {
      const { inspectionId, fields } = mutation.payload as { inspectionId: string; fields: Record<string, unknown> }
      const result = await saveInspectionFields(inspectionId, fields)
      if (result.error) return { ok: false, retry: false, message: result.error }
      return { ok: true }
    }

    case "attachInspectionMedia": {
      const { inspectionId, caption } = mutation.payload as { inspectionId: string; caption?: string }
      const resolved = await resolveStoragePath(companyId, mutation, ["media", "inspections", inspectionId])
      if (!resolved) return { ok: false, retry: false, message: "The photo for this upload is no longer available on this device." }
      if (resolved.error) return { ok: false, retry: true, message: resolved.error }
      const blob = await getBlob(mutation.id)
      const result = await attachInspectionMedia(
        inspectionId,
        resolved.path,
        blob?.fileName ?? "photo.jpg",
        blob?.mimeType ?? "image/jpeg",
        blob?.blob.size ?? 0,
        caption,
        mutation.id
      )
      if (result.error) return { ok: false, retry: false, message: result.error }
      return { ok: true }
    }

    case "completeInspection": {
      const { inspectionId, reservationId } = mutation.payload as { inspectionId: string; reservationId: string }
      const result = await completeInspectionAction(inspectionId, reservationId)
      if (result.error) {
        if (isAlreadyAppliedMessage(result.error)) return { ok: true }
        return { ok: false, retry: false, message: result.error }
      }
      return { ok: true }
    }

    case "createDamage": {
      const fields = mutation.payload as Record<string, string>
      const formData = new FormData()
      for (const [key, value] of Object.entries(fields)) formData.set(key, value)
      formData.set("idempotencyKey", mutation.id)
      const result = await createDamage({}, formData)
      if (result.error) return { ok: false, retry: false, message: result.error }
      return { ok: true }
    }

    case "createDocumentRecord": {
      const input = mutation.payload as Omit<CreateDocumentInput, "storagePath" | "idempotencyKey">
      const segments = input.customerId
        ? ["documents", "customers", input.customerId]
        : input.reservationId
          ? ["documents", "reservations", input.reservationId]
          : ["documents", "vehicles", input.vehicleId ?? "unknown"]
      const resolved = await resolveStoragePath(companyId, mutation, segments)
      if (!resolved) return { ok: false, retry: false, message: "The file for this upload is no longer available on this device." }
      if (resolved.error) return { ok: false, retry: true, message: resolved.error }
      const result = await createDocumentRecord({ ...input, storagePath: resolved.path, idempotencyKey: mutation.id })
      if (result.error) return { ok: false, retry: false, message: result.error }
      return { ok: true }
    }

    case "addContractSignature": {
      const { contractId, signerType, signerName } = mutation.payload as {
        contractId: string
        signerType: "customer" | "additional_driver" | "employee" | "manager"
        signerName: string
      }
      const resolved = await resolveStoragePath(companyId, mutation, ["signatures", contractId])
      if (!resolved) return { ok: false, retry: false, message: "The signature for this contract is no longer available on this device." }
      if (resolved.error) return { ok: false, retry: true, message: resolved.error }
      const result = await addSignatureAction({ contractId, signerType, signerName, signatureImagePath: resolved.path })
      if (!result.ok) return { ok: false, retry: false, message: result.error }
      return { ok: true }
    }
  }
}

/** Drains as much of the queue as it can in one pass. Safe to call
 * repeatedly (on reconnect, on an interval, on demand from a "sync now"
 * button) — an empty queue is a no-op. */
export async function syncOfflineMutations(companyId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, needsReview: 0, stillPending: 0 }
  const all = await listMutations()
  const pending = all.filter((m) => m.status !== "needs_review")
  // Only a mutation that actually SYNCED this pass counts as done. A
  // dependency sitting in needs_review is a real, unresolved rejection
  // — not seeding it here (a past bug) is what keeps a dependent like
  // completeInspection from running while a required photo attach is
  // still stuck waiting on a human, which would otherwise silently mark
  // an inspection complete despite genuinely missing evidence.
  const doneIds = new Set<string>()

  for (const mutation of pending) {
    if (!isMutationReady(mutation.dependsOn, all, doneIds)) {
      result.stillPending++
      continue
    }

    await updateMutation(mutation.id, { status: "syncing" })

    try {
      const outcome = await runMutation(companyId, mutation)
      if (outcome.ok) {
        await removeMutation(mutation.id)
        doneIds.add(mutation.id)
        result.synced++
        continue
      }

      if (outcome.retry) {
        await updateMutation(mutation.id, { status: "pending", retryCount: mutation.retryCount + 1, errorMessage: outcome.message })
        result.stillPending++
        // A retryable failure means the network is genuinely
        // unreachable right now — no point attempting the rest of the
        // queue in this same pass.
        break
      }

      await updateMutation(mutation.id, { status: "needs_review", errorMessage: outcome.message })
      result.needsReview++
    } catch {
      // A thrown exception (not a typed {error} result) means the call
      // itself couldn't reach the server — genuinely offline.
      await updateMutation(mutation.id, { status: "pending", retryCount: mutation.retryCount + 1 })
      result.stillPending++
      break
    }
  }

  return result
}
