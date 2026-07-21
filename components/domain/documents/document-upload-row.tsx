"use client"

import { useState } from "react"
import { FileText, Loader2, CheckCircle2 } from "lucide-react"

import { buildStoragePath, validateFile, ACCEPTED_DOCUMENT_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { createDocumentRecord } from "@/app/(dashboard)/documents/actions"
import { cn } from "@/lib/utils"
import type { DocumentCategory, RentalDocument } from "@/types/rental"

interface DocumentSlotDef {
  category: DocumentCategory
  label: string
}

function DocumentUploadRow({
  slot,
  companyId,
  reservationId,
  customerId,
  existing,
  onUploaded,
  onQueueOffline,
}: {
  slot: DocumentSlotDef
  companyId: string
  reservationId?: string
  customerId?: string
  existing?: RentalDocument
  onUploaded: (doc: RentalDocument) => void
  /** Roadmap phase 16 requirement 6 ("document scanning" queueable
   * offline) — called with a client-generated mutation id instead of
   * the normal upload+createDocumentRecord flow when the device is
   * offline; the row still shows "uploaded" immediately (see
   * PhotoUploadGrid's identical reasoning: syncing later is invisible
   * infrastructure, not something a field workflow should surface). */
  onQueueOffline?: (file: File) => Promise<{ mutationId: string } | { error: string }>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function placeholderDocument(id: string, file: File): RentalDocument {
    return {
      id,
      category: slot.category,
      originalFilename: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      contractReference: null,
      notes: null,
      status: "active",
      uploadedByName: null,
      createdAt: new Date().toISOString(),
      reservationId: reservationId ?? null,
      customerId: customerId ?? null,
      vehicleId: null,
      url: null,
      expiresOn: null,
    }
  }

  async function handleFile(file: File) {
    setError(null)
    const validationError = validateFile(file, ACCEPTED_DOCUMENT_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)

    if (onQueueOffline && !navigator.onLine) {
      const queued = await onQueueOffline(file)
      setBusy(false)
      if ("error" in queued) {
        setError(queued.error)
        return
      }
      onUploaded(placeholderDocument(`queued:${queued.mutationId}`, file))
      return
    }

    const path = buildStoragePath(companyId, ["documents", reservationId ?? customerId ?? "misc"], file.name)
    const upload = await uploadFile(path, file)
    if (upload.error) {
      if (onQueueOffline) {
        const queued = await onQueueOffline(file)
        setBusy(false)
        if ("error" in queued) {
          setError(queued.error)
          return
        }
        onUploaded(placeholderDocument(`queued:${queued.mutationId}`, file))
        return
      }
      setError(upload.error)
      setBusy(false)
      return
    }
    const result = await createDocumentRecord({
      category: slot.category,
      storagePath: path,
      originalFilename: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      reservationId,
      customerId,
    })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onUploaded(placeholderDocument(result.documentId!, file))
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        className={cn(
          "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border px-3 py-3 transition-colors hover:bg-muted",
          existing && "border-emerald-300 dark:border-emerald-500/40"
        )}
      >
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ""
          }}
        />
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              existing
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {existing ? <CheckCircle2 className="size-4" /> : <FileText className="size-4" />}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium text-foreground">{slot.label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {existing ? existing.originalFilename : "Not uploaded"}
            </span>
          </div>
        </div>
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <span className="shrink-0 text-xs font-medium text-primary">{existing ? "Replace" : "Upload"}</span>
        )}
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { DocumentUploadRow }
export type { DocumentSlotDef }
