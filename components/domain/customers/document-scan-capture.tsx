"use client"

import { useState } from "react"
import { Camera, Loader2 } from "lucide-react"

import { validateFile, ACCEPTED_SCAN_MIME_TYPES } from "@/lib/storage"
import { extractOnboardingDocument } from "@/app/(dashboard)/customers/actions"
import type { ExtractedFields } from "@/lib/document-extraction"
import type { DocumentCategory } from "@/types/rental"
import { cn } from "@/lib/utils"

export type ScanCaptureResult =
  | { ok: true; category: DocumentCategory; classificationConfidence: number; fields: ExtractedFields | null }
  | { ok: false; message: string }

/** Camera-first capture button for one document (roadmap phase 14).
 * Same dashed-pill "Add photo" pattern as damage-photo-upload.tsx and
 * photo-upload-grid.tsx (`capture="environment"`, no getUserMedia —
 * there is no precedent for that anywhere in this app), but instead of
 * uploading to Storage it runs classify+extract against the raw bytes
 * (extractOnboardingDocument -> classifyAndExtractBytes) since no
 * customer exists yet to attach a real `documents` row to. The parent
 * keeps the captured File so it can upload it for real once the
 * customer record is created. */
function DocumentScanCapture({
  label,
  busyLabel = "Reading document…",
  onCaptured,
}: {
  label: string
  busyLabel?: string
  onCaptured: (file: File, result: ScanCaptureResult) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    const validationError = validateFile(file, ACCEPTED_SCAN_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    const formData = new FormData()
    formData.set("file", file)
    const result = await extractOnboardingDocument(formData)
    setBusy(false)

    if (result.error) {
      setError(result.error)
      onCaptured(file, { ok: false, message: result.error })
      return
    }
    if (result.extractionMessage) {
      setError(result.extractionMessage)
      onCaptured(file, { ok: false, message: result.extractionMessage })
      return
    }
    onCaptured(file, {
      ok: true,
      category: result.category!,
      classificationConfidence: result.classificationConfidence ?? 0,
      fields: result.fields ?? null,
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className={cn(
          "flex w-fit cursor-pointer items-center gap-2 rounded-full border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground transition-colors",
          busy ? "opacity-70" : "hover:bg-muted"
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
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        {busy ? busyLabel : label}
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { DocumentScanCapture }
