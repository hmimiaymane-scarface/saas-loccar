"use client"

import { useState } from "react"
import { Camera, Loader2 } from "lucide-react"

import { buildStoragePath, validateFile, ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { cn } from "@/lib/utils"

interface AdditionalPhotosProps {
  companyId: string
  pathSegments: string[]
  count: number
  onUpload: (file: File, storagePath: string) => Promise<{ error?: string }>
  /** Same offline-queueing contract as PhotoUploadGrid's own prop. */
  onQueueOffline?: (file: File) => Promise<{ error?: string }>
}

/**
 * Roadmap phase 25 — free-form, never-required photo capture alongside
 * the fixed required-angle grid (PhotoUploadGrid). No slot key, no cap,
 * no effect on inspection completeness — purely "anything else worth a
 * photo" (a scratch close-up, a stain, an accessory) that doesn't fit
 * one of the seven named required angles.
 */
function AdditionalPhotos({ companyId, pathSegments, count, onUpload, onQueueOffline }: AdditionalPhotosProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    const validationError = validateFile(file, ACCEPTED_IMAGE_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)

    if (onQueueOffline && !navigator.onLine) {
      const queued = await onQueueOffline(file)
      if (queued.error) setError(queued.error)
      setBusy(false)
      return
    }

    const path = buildStoragePath(companyId, pathSegments, file.name)
    const upload = await uploadFile(path, file)
    if (upload.error) {
      if (onQueueOffline) {
        const queued = await onQueueOffline(file)
        if (queued.error) setError(queued.error)
        setBusy(false)
        return
      }
      setError(upload.error)
      setBusy(false)
      return
    }
    const result = await onUpload(file, path)
    if (result.error) setError(result.error)
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-dashed border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted",
            busy && "pointer-events-none opacity-60"
          )}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
              e.target.value = ""
            }}
          />
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          Add photo
        </label>
        {count > 0 && (
          <span className="text-sm text-muted-foreground">
            {count} extra photo{count === 1 ? "" : "s"} added
          </span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { AdditionalPhotos }
