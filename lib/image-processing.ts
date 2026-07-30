/**
 * Roadmap phase 38 ("Image Compression and Upload Optimization") — the
 * generic load/resize/compress plumbing extracted from
 * `document-scan-capture.tsx` (phase 21), so a second caller
 * (`photo-upload-grid.tsx`, `damage-photo-upload.tsx`) doesn't have to
 * duplicate it. Deliberately does NOT include document-scan's own
 * ID-card-specific crop step (`lib/document-scan-quality.ts#cropBoxForAspectRatio`)
 * — that stays where it is, since an inspection/damage photo should
 * never be cropped to a fixed card aspect ratio.
 *
 * DOM/Canvas-based (HTMLImageElement, HTMLCanvasElement, Blob) — this
 * repo's vitest runs in a `node` environment with no jsdom/canvas
 * polyfill (see AGENTS.md's testing-conventions section), so this
 * module is verified via a real browser pass with synthetic images,
 * not a vitest suite — the same convention phase 21's own canvas code
 * already established.
 *
 * Orientation: `HTMLImageElement` decoding (used by `loadFileToImage`
 * below) auto-applies EXIF orientation in every current browser engine
 * (the CSS Images spec's `image-orientation: from-image` default) — a
 * rotated phone photo already comes out right-side-up through this
 * pipeline with no extra code, confirmed with a synthetic EXIF-rotated
 * test image during this phase's live verification pass rather than
 * just assumed.
 */

export function loadFileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read that photo."))
    }
    img.src = url
  })
}

/** Draws `img` onto a canvas, downscaled so neither dimension exceeds
 * `maxDimension` — never upscales a smaller photo. Omit `maxDimension`
 * to draw at the image's native resolution. */
export function drawToCanvas(img: HTMLImageElement, maxDimension?: number): HTMLCanvasElement {
  const scale = maxDimension ? Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight)) : 1
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext("2d")
  ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Resizes `canvas` (if it exceeds `maxDimension`) and encodes it as a
 * compressed JPEG `File`. The resize-then-compress tail every caller
 * needs, regardless of what led to the canvas (a plain resize, or a
 * crop like document-scan-capture.tsx's own `cropBoxForAspectRatio`
 * step) — callers pass in whatever canvas they've already prepared. */
export function canvasToCompressedFile(
  canvas: HTMLCanvasElement,
  filename: string,
  options: { maxDimension: number; quality: number }
): Promise<File> {
  const scale = Math.min(1, options.maxDimension / Math.max(canvas.width, canvas.height))
  const output = document.createElement("canvas")
  output.width = Math.round(canvas.width * scale)
  output.height = Math.round(canvas.height * scale)
  const ctx = output.getContext("2d")
  ctx?.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, output.width, output.height)

  return new Promise((resolve, reject) => {
    output.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not process that photo."))
          return
        }
        resolve(new File([blob], filename, { type: "image/jpeg" }))
      },
      "image/jpeg",
      options.quality
    )
  })
}

/** Convenience wrapper for the common case (no crop, just resize +
 * compress): load the file, draw it at native resolution, then produce
 * the compressed output in one call. */
export async function compressImageFile(
  file: File,
  options: { maxDimension: number; quality: number }
): Promise<File> {
  const img = await loadFileToImage(file)
  const canvas = drawToCanvas(img)
  return canvasToCompressedFile(canvas, file.name, options)
}
