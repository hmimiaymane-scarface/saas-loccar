"use client"

import { useState } from "react"
import { Camera, Loader2 } from "lucide-react"

import { buildStoragePath, validateFile, ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { cn } from "@/lib/utils"

interface PhotoSlot {
  key: string
  label: string
  required?: boolean
}

interface UploadedPhoto {
  key: string
}

function PhotoUploadGrid({
  slots,
  companyId,
  pathSegments,
  uploaded,
  onUpload,
  onQueueOffline,
}: {
  slots: PhotoSlot[]
  companyId: string
  pathSegments: string[]
  uploaded: UploadedPhoto[]
  onUpload: (slotKey: string, file: File, storagePath: string) => Promise<{ error?: string }>
  /** Roadmap phase 16 requirement 6 — when provided and the device is
   * offline, this is called INSTEAD of the normal upload-then-onUpload
   * flow (both of which need a live network). The slot still shows the
   * same "captured" checkmark either way — from the employee's
   * perspective a queued photo IS captured; syncing later is invisible
   * infrastructure, not something a field workflow should make them
   * think about. */
  onQueueOffline?: (slotKey: string, file: File) => Promise<{ error?: string }>
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(slotKey: string, file: File) {
    setError(null)
    const validationError = validateFile(file, ACCEPTED_IMAGE_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusyKey(slotKey)

    if (onQueueOffline && !navigator.onLine) {
      const queued = await onQueueOffline(slotKey, file)
      if (queued.error) setError(queued.error)
      setBusyKey(null)
      return
    }

    const path = buildStoragePath(companyId, pathSegments, file.name)
    const upload = await uploadFile(path, file)
    if (upload.error) {
      // A network-shaped failure after all — fall back to queueing
      // rather than surfacing an error the employee can't act on mid-task.
      if (onQueueOffline) {
        const queued = await onQueueOffline(slotKey, file)
        if (queued.error) setError(queued.error)
        setBusyKey(null)
        return
      }
      setError(upload.error)
      setBusyKey(null)
      return
    }
    const result = await onUpload(slotKey, file, path)
    if (result.error) setError(result.error)
    setBusyKey(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slots.map((slot) => {
          const existing = uploaded.find((u) => u.key === slot.key)
          const isBusy = busyKey === slot.key
          return (
            <label
              key={slot.key}
              className={cn(
                "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed p-2 text-center transition-colors",
                existing
                  ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
                  : "border-border hover:bg-muted"
              )}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={isBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(slot.key, file)
                  e.target.value = ""
                }}
              />
              {isBusy ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <Camera
                  className={cn(
                    "size-5",
                    existing ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                />
              )}
              <span className="text-[11px] font-medium text-foreground">{slot.label}</span>
              {slot.required && !existing && (
                <span className="text-[10px] text-muted-foreground">Required</span>
              )}
            </label>
          )
        })}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { PhotoUploadGrid }
export type { PhotoSlot, UploadedPhoto }
