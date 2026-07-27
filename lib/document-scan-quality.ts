/**
 * Productization wave 3 phase 21 — "make ID scanning feel
 * trustworthy." Pure heuristics behind the post-capture quality check:
 * given a plain grayscale luminance array (already extracted from a
 * canvas by the client-side pipeline in `document-scan-capture.tsx`),
 * decide whether the photo looks blurry or glare-affected. Zero DOM
 * dependency, so unit-testable against small hand-built fixtures —
 * this repo has no canvas/DOM test environment (vitest runs
 * `environment: "node"`), so any code that actually touches
 * `HTMLCanvasElement`/`Image` stays in the component itself, same
 * split every other intelligence feature in this app uses.
 *
 * These thresholds are a first-pass heuristic, not a scientifically
 * calibrated one — same honest framing as this app's AI confidence
 * scores elsewhere ("coarse, not statistical"). They should be
 * revisited once real ID photos are available to tune against.
 */

/** Variance of the discrete Laplacian below this looks blurry — flat/
 * smooth regions dominate over sharp edges. Doubles as this feature's
 * "edge detection": edge/gradient strength is exactly what determines
 * blur, so a separate boundary-finding feature isn't built to satisfy
 * the same brief item twice. */
export const BLUR_VARIANCE_THRESHOLD = 50

/** A pixel this bright or brighter counts as "blown out" by glare. */
export const GLARE_LUMINANCE_THRESHOLD = 245

/** This fraction of blown-out pixels or more counts as glare. */
export const GLARE_RATIO_THRESHOLD = 0.12

/** ISO/IEC 7810 ID-1 card ratio (width:height), the shape every
 * national ID/passport/licence this app scans approximates. */
export const ID_CARD_ASPECT_RATIO = 1.586

/** Variance of the discrete Laplacian (each pixel minus the average of
 * its 4 neighbours) across the interior of the image — a standard,
 * simple sharpness proxy. Low variance means edges are weak/absent
 * (blurry); high variance means strong edges are present (sharp). */
export function computeLaplacianVariance(luminance: number[], width: number, height: number): number {
  if (width < 3 || height < 3) return 0
  const laplacians: number[] = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const value = 4 * luminance[i] - luminance[i - 1] - luminance[i + 1] - luminance[i - width] - luminance[i + width]
      laplacians.push(value)
    }
  }
  if (laplacians.length === 0) return 0
  const mean = laplacians.reduce((sum, v) => sum + v, 0) / laplacians.length
  return laplacians.reduce((sum, v) => sum + (v - mean) ** 2, 0) / laplacians.length
}

/** Fraction of pixels at or above `threshold` — a proxy for glare/
 * overexposure (a real glare spot reads as a cluster of near-white
 * pixels). */
export function computeGlareRatio(luminance: number[], threshold: number = GLARE_LUMINANCE_THRESHOLD): number {
  if (luminance.length === 0) return 0
  const blown = luminance.filter((v) => v >= threshold).length
  return blown / luminance.length
}

export interface ScanQualityResult {
  blurScore: number
  glareRatio: number
  blurWarning: boolean
  glareWarning: boolean
}

/** Both warnings are advisory, never a hard block — same posture as
 * every other heuristic/AI signal in this app (returning-customer
 * readiness, duplicate detection, contract-signing status). The
 * caller always offers "use this photo anyway" alongside "retake." */
export function assessScanQuality(luminance: number[], width: number, height: number): ScanQualityResult {
  const blurScore = computeLaplacianVariance(luminance, width, height)
  const glareRatio = computeGlareRatio(luminance)
  return {
    blurScore,
    glareRatio,
    blurWarning: blurScore < BLUR_VARIANCE_THRESHOLD,
    glareWarning: glareRatio >= GLARE_RATIO_THRESHOLD,
  }
}

export interface CropBox {
  x: number
  y: number
  width: number
  height: number
}

/** A centered crop box matching `targetRatio`. Deliberately not a real
 * document-boundary detector — finding a card's actual edges against
 * an arbitrary background reliably needs real computer vision this
 * repo doesn't depend on. A centered, ratio-matched crop is the
 * honest, achievable version of "automatic crop": correct whenever the
 * document roughly fills the frame (the framing hint's whole point),
 * not a smarter claim than that. */
export function cropBoxForAspectRatio(width: number, height: number, targetRatio: number = ID_CARD_ASPECT_RATIO): CropBox {
  const currentRatio = width / height
  if (currentRatio > targetRatio) {
    const cropWidth = Math.round(height * targetRatio)
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height }
  }
  const cropHeight = Math.round(width / targetRatio)
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight }
}
