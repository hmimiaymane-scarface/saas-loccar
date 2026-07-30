"use client"

import { useRef, useState } from "react"
import { Camera, Loader2, AlertTriangle, RotateCcw } from "lucide-react"

import { validateFile, ACCEPTED_SCAN_MIME_TYPES } from "@/lib/storage"
import { extractOnboardingDocument } from "@/app/(dashboard)/customers/actions"
import { assessScanQuality, cropBoxForAspectRatio, type ScanQualityResult } from "@/lib/document-scan-quality"
import { loadFileToImage, drawToCanvas, canvasToCompressedFile } from "@/lib/image-processing"
import type { ExtractedFields } from "@/lib/document-extraction"
import type { DocumentCategory } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ScanCaptureResult =
  | { ok: true; category: DocumentCategory; classificationConfidence: number; fields: ExtractedFields | null }
  | { ok: false; message: string }

/** Analysis runs on a downsized copy — plenty for a blur/glare estimate,
 * much faster than working with a full-resolution phone photo. */
const ANALYSIS_MAX_DIMENSION = 400
/** The photo that's actually cropped/compressed and sent for
 * extraction/upload — large enough for the vision model and a legible
 * stored document, small enough to upload quickly. */
const OUTPUT_MAX_DIMENSION = 1600
const OUTPUT_JPEG_QUALITY = 0.82

function getLuminance(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext("2d")
  if (!ctx) return []
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const luminance: number[] = new Array(canvas.width * canvas.height)
  for (let i = 0; i < luminance.length; i++) {
    const o = i * 4
    luminance[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
  }
  return luminance
}

/** Crops to the ID-card aspect ratio, then hands the resize/encode tail
 * to the shared `canvasToCompressedFile` (lib/image-processing.ts) —
 * the one piece of this pipeline that's genuinely specific to document
 * scanning, everything after it is generic. */
function cropAndCompress(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  const box = cropBoxForAspectRatio(canvas.width, canvas.height)
  const cropped = document.createElement("canvas")
  cropped.width = box.width
  cropped.height = box.height
  const ctx = cropped.getContext("2d")
  ctx?.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)

  return canvasToCompressedFile(cropped, filename, { maxDimension: OUTPUT_MAX_DIMENSION, quality: OUTPUT_JPEG_QUALITY })
}

/**
 * Camera-first capture button for one document (roadmap phase 14,
 * polished in productization wave 3 phase 21). Same dashed-pill "Add
 * photo" pattern as damage-photo-upload.tsx/photo-upload-grid.tsx
 * (`capture="environment"`, no `getUserMedia` — still no precedent
 * for a live camera view anywhere in this app, a deliberate choice
 * this phase keeps rather than reverses). What changed: the picked
 * photo now goes through a client-side canvas pipeline before
 * extraction — analyzed for blur/glare (advisory only, same posture
 * as every other heuristic signal in this app: "retake" or "use
 * anyway," never a hard block), cropped to the ID card's aspect ratio,
 * and compressed — instead of sending the raw camera output as-is.
 */
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
  const [statusLabel, setStatusLabel] = useState(busyLabel)
  const [showProgress, setShowProgress] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qualityWarning, setQualityWarning] = useState<ScanQualityResult | null>(null)
  const [hasProcessedFile, setHasProcessedFile] = useState(false)
  const pendingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const pendingFilenameRef = useRef<string>("scan.jpg")
  const processedFileRef = useRef<File | null>(null)

  async function runExtraction(file: File) {
    processedFileRef.current = file
    setHasProcessedFile(true)
    setError(null)
    setBusy(true)
    setStatusLabel("Reading document…")
    setShowProgress(true)
    const formData = new FormData()
    formData.set("file", file)
    const result = await extractOnboardingDocument(formData)
    setShowProgress(false)
    setBusy(false)

    if (result.error) {
      setError(result.error)
      onCaptured(file, { ok: false, message: result.error })
      return
    }
    if (result.extractionMessage) {
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

  async function proceedWithCanvas(canvas: HTMLCanvasElement) {
    setQualityWarning(null)
    setBusy(true)
    setStatusLabel("Preparing photo…")
    try {
      const file = await cropAndCompress(canvas, pendingFilenameRef.current)
      await runExtraction(file)
    } catch {
      setBusy(false)
      setError("Could not process that photo. Try again.")
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setQualityWarning(null)
    const validationError = validateFile(file, ACCEPTED_SCAN_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }

    pendingFilenameRef.current = file.name
    setBusy(true)
    setStatusLabel("Checking photo…")
    try {
      const img = await loadFileToImage(file)
      const fullCanvas = drawToCanvas(img)
      pendingCanvasRef.current = fullCanvas
      const analysisCanvas = drawToCanvas(img, ANALYSIS_MAX_DIMENSION)
      const quality = assessScanQuality(getLuminance(analysisCanvas), analysisCanvas.width, analysisCanvas.height)

      if (quality.blurWarning || quality.glareWarning) {
        setBusy(false)
        setQualityWarning(quality)
        return
      }
      await proceedWithCanvas(fullCanvas)
    } catch {
      setBusy(false)
      setError("Could not read that photo. Try again.")
    }
  }

  function retake() {
    setQualityWarning(null)
    setError(null)
    setHasProcessedFile(false)
    pendingCanvasRef.current = null
    processedFileRef.current = null
  }

  function useAnyway() {
    if (pendingCanvasRef.current) void proceedWithCanvas(pendingCanvasRef.current)
  }

  function retry() {
    if (processedFileRef.current) void runExtraction(processedFileRef.current)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {!qualityWarning && (
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
          {busy ? statusLabel : label}
        </label>
      )}

      {!qualityWarning && !busy && (
        <p className="text-[11px] text-muted-foreground">Fill the frame, keep it flat, avoid glare.</p>
      )}

      {busy && showProgress && (
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full animate-pulse rounded-full bg-primary" />
        </div>
      )}

      {qualityWarning && (
        <div className="flex flex-col gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {qualityWarning.blurWarning && qualityWarning.glareWarning
              ? "Photo looks blurry and has glare — hold steady, avoid direct light, and retake."
              : qualityWarning.blurWarning
                ? "Photo looks blurry — hold steady and retake."
                : "Glare detected — avoid direct light and retake."}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={retake}>
              <RotateCcw className="size-3.5" />
              Retake
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={useAnyway}>
              Use this photo anyway
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 text-xs text-destructive">
          <span>{error}</span>
          {hasProcessedFile && (
            <Button type="button" size="sm" variant="outline" onClick={retry}>
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export { DocumentScanCapture }
