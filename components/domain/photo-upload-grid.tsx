"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Loader2 } from "lucide-react"

import { buildStoragePath, validateFile, ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { compressImageFile, EVIDENCE_PHOTO_MAX_DIMENSION, EVIDENCE_PHOTO_JPEG_QUALITY } from "@/lib/image-processing"
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
  const [statusLabel, setStatusLabel] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  // Roadmap phase 38 — a live thumbnail of what was actually captured
  // this session (real visual confirmation, not just a checkmark).
  // Deliberately session-only: `UploadedPhoto` carries no URL today, so
  // a slot that was already uploaded in a *prior* session still falls
  // back to the plain checkmark — extending that would mean touching
  // every caller that builds the `uploaded` array, out of this phase's
  // scope.
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const lastFileRef = useRef<Record<string, File>>({})
  const thumbnailUrlsRef = useRef<Record<string, string>>({})

  useEffect(() => {
    // Same object reference for the component's whole lifetime (only
    // ever mutated in place, never reassigned) — capturing it here
    // satisfies react-hooks' "ref value may have changed by cleanup
    // time" rule without changing what actually gets revoked.
    const urls = thumbnailUrlsRef.current
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  async function attemptUpload(slotKey: string, file: File) {
    setBusyKey(slotKey)
    setFailedKey(null)
    setError(null)
    setStatusLabel("Uploading…")

    if (onQueueOffline && !navigator.onLine) {
      const queued = await onQueueOffline(slotKey, file)
      if (queued.error) {
        setError(queued.error)
        setFailedKey(slotKey)
      }
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
        if (queued.error) {
          setError(queued.error)
          setFailedKey(slotKey)
        }
        setBusyKey(null)
        return
      }
      setError(upload.error)
      setFailedKey(slotKey)
      setBusyKey(null)
      return
    }
    const result = await onUpload(slotKey, file, path)
    if (result.error) {
      setError(result.error)
      setFailedKey(slotKey)
    }
    setBusyKey(null)
  }

  async function handleFile(slotKey: string, file: File) {
    setError(null)
    setFailedKey(null)
    const validationError = validateFile(file, ACCEPTED_IMAGE_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }

    setBusyKey(slotKey)
    setStatusLabel("Compressing…")

    let compressed: File
    try {
      compressed = await compressImageFile(file, { maxDimension: EVIDENCE_PHOTO_MAX_DIMENSION, quality: EVIDENCE_PHOTO_JPEG_QUALITY })
    } catch {
      // Compression failing is rare (a corrupt/unreadable file) — fall
      // back to the original rather than blocking capture entirely on
      // a client-side processing bug.
      compressed = file
    }

    lastFileRef.current[slotKey] = compressed
    const url = URL.createObjectURL(compressed)
    const previousUrl = thumbnailUrlsRef.current[slotKey]
    thumbnailUrlsRef.current[slotKey] = url
    setThumbnails((prev) => ({ ...prev, [slotKey]: url }))
    if (previousUrl) URL.revokeObjectURL(previousUrl)

    await attemptUpload(slotKey, compressed)
  }

  function retry(slotKey: string) {
    const file = lastFileRef.current[slotKey]
    if (file) void attemptUpload(slotKey, file)
  }

  const failedSlotLabel = failedKey ? slots.find((s) => s.key === failedKey)?.label : null

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slots.map((slot) => {
          const existing = uploaded.find((u) => u.key === slot.key)
          const isBusy = busyKey === slot.key
          const thumbnail = thumbnails[slot.key]
          return (
            <label
              key={slot.key}
              className={cn(
                "relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-dashed p-2 text-center transition-colors",
                existing || thumbnail
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
              {thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnail} alt={slot.label} className="absolute inset-0 size-full object-cover" />
              )}
              <div className={cn("relative flex flex-col items-center gap-1.5", thumbnail && "rounded-lg bg-black/45 px-2 py-1.5")}>
                {isBusy ? (
                  <Loader2 className="size-5 animate-spin text-white" />
                ) : (
                  <Camera className={cn("size-5", thumbnail ? "text-white" : existing ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
                )}
                <span className={cn("text-[11px] font-medium", thumbnail ? "text-white" : "text-foreground")}>{slot.label}</span>
                {slot.required && !existing && !thumbnail && (
                  <span className="text-[10px] text-muted-foreground">Required</span>
                )}
              </div>
            </label>
          )
        })}
      </div>
      {busyKey && <p className="text-xs text-muted-foreground">{statusLabel}</p>}
      {error && (
        <div className="flex items-center justify-between gap-2 text-xs text-destructive">
          <span>
            {failedSlotLabel ? `${failedSlotLabel}: ` : ""}
            {error}
          </span>
          {failedKey && (
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => retry(failedKey)}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export { PhotoUploadGrid }
export type { PhotoSlot, UploadedPhoto }
