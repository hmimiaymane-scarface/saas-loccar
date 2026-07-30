"use client"

import { useState } from "react"
import { Camera, Loader2 } from "lucide-react"

import { buildStoragePath, validateFile, ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { compressImageFile, EVIDENCE_PHOTO_MAX_DIMENSION, EVIDENCE_PHOTO_JPEG_QUALITY } from "@/lib/image-processing"
import { attachDamageMedia } from "@/app/(dashboard)/damages/actions"
import type { MediaFile } from "@/types/rental"

function DamagePhotoUpload({
  damageId,
  companyId,
  onUploaded,
}: {
  damageId: string
  companyId: string
  onUploaded: (media: MediaFile) => void
}) {
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
    let compressed: File
    try {
      compressed = await compressImageFile(file, { maxDimension: EVIDENCE_PHOTO_MAX_DIMENSION, quality: EVIDENCE_PHOTO_JPEG_QUALITY })
    } catch {
      compressed = file
    }
    const path = buildStoragePath(companyId, ["damages", damageId], compressed.name)
    const upload = await uploadFile(path, compressed)
    if (upload.error) {
      setError(upload.error)
      setBusy(false)
      return
    }
    const result = await attachDamageMedia(damageId, path, compressed.name, compressed.type, compressed.size)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onUploaded({
      id: result.mediaId!,
      entityType: "damage",
      entityId: damageId,
      originalFilename: compressed.name,
      mimeType: compressed.type,
      caption: null,
      url: null,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted">
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
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        Add photo
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { DamagePhotoUpload }
