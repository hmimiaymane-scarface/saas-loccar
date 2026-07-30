# Image compression and upload optimization (roadmap phase 38)

## What this phase found

Phase 21 ("Camera-First Document Capture Polish") had already built a real
canvas-based resize/compress/quality-check pipeline, but only for customer
document scanning (`components/domain/customers/document-scan-capture.tsx`).
The components that actually handle "a full pickup/return photo set" — the
thing this phase's brief names directly — never got it:

- `components/domain/photo-upload-grid.tsx` (the 7-photo pickup/return
  inspection grid) uploaded the raw, uncompressed camera file.
- `components/domain/damages/damage-photo-upload.tsx` (damage-recording
  photos, captured during the same workflows) had the same gap.
- `components/domain/inspections/additional-photos.tsx` (free-form
  additional inspection photos, phase 25) — found mid-implementation by
  grepping for other raw-upload call sites, not part of the original plan,
  fixed for consistency.

A real phone camera photo is typically several MB; uploading seven of them
raw over "normal mobile internet" was a concrete instance of the exact
problem the brief describes.

## What was built

- **`lib/image-processing.ts`** (new) — the generic load/resize/compress
  pipeline (`loadFileToImage`, `drawToCanvas`, `canvasToCompressedFile`,
  `compressImageFile`) extracted from `document-scan-capture.tsx`, plus the
  shared evidence-photo constants: `EVIDENCE_PHOTO_MAX_DIMENSION = 2000`,
  `EVIDENCE_PHOTO_JPEG_QUALITY = 0.85`. Deliberately higher than
  document-scan's own 1600px/0.82 — an ID card just needs to be legible; an
  inspection/damage photo is evidence for a damage dispute and needs finer
  detail preserved.
- **`document-scan-capture.tsx`** refactored to consume the shared module
  instead of defining `loadFileToImage`/`drawToCanvas` locally — a pure
  DRY-up, zero behavior change. Its own ID-card crop step
  (`cropBoxForAspectRatio`) stays local, since inspection/damage photos
  should never be cropped to a fixed card aspect ratio.
- **`photo-upload-grid.tsx`** — the main target of this phase. Now:
  compresses before upload (and before offline-queueing, which also shrinks
  what IndexedDB has to hold); shows a live thumbnail of the just-captured
  photo filling the slot tile instead of a bare checkmark (session-only —
  `UploadedPhoto` carries no URL today, so a slot uploaded in a prior
  session still falls back to the checkmark); keeps the last-failed
  compressed file so a genuine upload failure (not the offline-queue path,
  which already degrades gracefully) shows a Retry button; progressive
  status label ("Compressing…" → "Uploading…"), the same honest
  indeterminate-bar treatment `document-scan-capture.tsx` already
  established rather than a fabricated byte-percentage.
- **`damage-photo-upload.tsx`** — compression added. Also fixed a real bug
  found while wiring this in: `attachDamageMedia` and the `onUploaded`
  callback were being passed the *original* file's stale name/type/size
  even though the uploaded bytes were now the compressed JPEG — corrected
  to pass the compressed file's metadata.
- **`additional-photos.tsx`** — same compression step added for
  consistency with the other three capture points.
- **Background upload**: already true before this phase.
  `PhotoUploadGrid`'s `busyKey` only disables the one slot currently
  uploading, so capturing a different slot while another is in flight
  already worked — documented as already-satisfied rather than rebuilt into
  new queueing infrastructure disproportionate to this phase.

## Verification

`tsc`/`eslint`/`vitest` (681 tests)/`next build` all clean after every
checkpoint.

The pipeline is DOM/Canvas-based (`HTMLImageElement`, `HTMLCanvasElement`,
`Blob`) and this repo's vitest runs in a `node` environment with no
jsdom/canvas polyfill, so it isn't covered by a vitest suite — the same
convention phase 21 already established for this exact code. Verified
instead with a real browser pass (mock-mode dev server) using two synthetic
images generated via PowerShell/`System.Drawing`:

- **Compression, `large-photo.jpg`** (4000×3000, ~524 KB, JPEG quality 95 —
  simulating a real phone-camera photo): uploaded through
  `DocumentScanCapture` on `/customers/new` with `HTMLCanvasElement.prototype.toBlob`
  monkey-patched to record the actual output. Result: **1600×1009,
  56,510 bytes** — a real ~89% size reduction, not assumed from reading the
  code.
- **EXIF orientation, `exif-rotated.jpg`** (800×600 raw pixel data, EXIF
  Orientation tag manually set to 6 — "rotate 90° CW for correct display"):
  uploaded the same way with `CanvasRenderingContext2D.prototype.drawImage`
  monkey-patched to record the source image's `naturalWidth`/`naturalHeight`
  the first time it's drawn. Result: **600×800** — the browser had already
  swapped the dimensions decoding the `<img>`, confirming this pipeline's
  claim that EXIF orientation is auto-corrected with no extra code, in this
  actual browser engine, not just per the CSS Images spec on paper.
- Zero console errors during either pass.

**Known verification gap, not a phase-38 regression**: `PhotoUploadGrid`'s
new thumbnail/retry UI could not be exercised live. Reaching it requires an
in-progress inspection (`/reservations/:id/return`, Step 2), and mock mode
shows "Inspections require a connected Supabase project" at that step —
the inspection row itself needs a live Supabase project to create, the same
limitation already found during phase 30. `photo-upload-grid.tsx`'s new
code was verified by full type-check/lint/test/build and manual code
review (including the same `URL.createObjectURL`/`revokeObjectURL` and
compress-then-upload pattern already proven live via
`DocumentScanCapture`), but not by clicking through its own UI in a
browser. A human with a real Supabase project should click through an
actual return's photo grid before fully trusting the thumbnail/retry
behavior in production.
