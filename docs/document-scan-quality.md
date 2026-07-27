# Camera-First Document Capture Polish

Productization wave 3 phase 21 — "make ID scanning feel trustworthy
and fast... owners understand immediately whether the photo is
usable."

## The one architectural call this phase made

**Not** switching to a live `getUserMedia` camera view with a
real-time overlay. `document-scan-capture.tsx` is still a plain
`<input type="file" capture="environment">` button — no live preview,
no video element, same as roadmap phase 14 deliberately chose and
every other photo-capture surface in this app (damage photos,
inspection photos) already uses. Reversing that for one component
would be a genuinely new capability (camera permissions, video
lifecycle, mobile Safari quirks), not a "polish" of this one. Every
item in the brief is instead delivered as **client-side post-capture
analysis** on plain `<canvas>` — this app already has one hand-rolled
canvas precedent (`signature-pad.tsx`), so this isn't a new dependency
or pattern, just a new use of an existing one.

## What was built

**Pure module**, `lib/document-scan-quality.ts` (zero DOM dependency,
hand-fixture tested):

- `computeLaplacianVariance` — variance of the discrete Laplacian
  (each pixel minus the average of its 4 neighbours), a standard
  sharpness proxy. Low variance = blurry. **This is also this
  feature's "edge detection"** — edge/gradient strength is exactly
  what determines blur, so a second, separate boundary-finding feature
  wasn't built to satisfy the same brief item twice.
- `computeGlareRatio` — fraction of near-white (blown-out) pixels.
- `assessScanQuality` — combines both into `{ blurWarning,
  glareWarning }`. Thresholds are named constants (`BLUR_VARIANCE_THRESHOLD`,
  `GLARE_LUMINANCE_THRESHOLD`, `GLARE_RATIO_THRESHOLD`), documented as
  a first-pass heuristic to calibrate against real photos later — same
  honest "coarse, not statistical" framing this app already uses for
  AI confidence scores.
- `cropBoxForAspectRatio` — a centered crop box matching the ID-1 card
  ratio (1.586). **Deliberately not a real document-boundary
  detector** — finding a card's actual edges against an arbitrary
  background reliably needs real computer vision this repo doesn't
  depend on. A centered, ratio-matched crop is the honest, achievable
  version of "automatic crop": correct whenever the document roughly
  fills the frame (the framing hint's whole point), not a smarter
  claim than that.

**`DocumentScanCapture` pipeline**: pick photo → load into canvas →
analyze (downsized copy, fast) → if blur/glare, show a specific
warning with **Retake** and **Use this photo anyway** (advisory only,
same posture as every other heuristic/AI signal in this app — never a
hard block) → otherwise skip straight to the next step with zero extra
click (same "don't add a click when nothing needs a human decision"
principle wave 3 phase 19 used) → crop to the ID ratio → compress
(capped max dimension, JPEG quality) → extract. An indeterminate
progress bar shows during the extract call — server actions don't
expose real byte-level upload progress, so an honestly-labeled
indeterminate indicator is the truthful version of "upload progress"
rather than a fabricated percentage. A **Retry** action (distinct from
Retake) resends the same already-processed file on a technical/infra
error without making the user take a new photo; a business-logic
"wrong document type" mismatch still asks for a real retake, unchanged
from before.

**Confidence-review summary**: both scan surfaces
(`CustomerOnboardingWizard`'s Identity/Driving-licence steps,
`NewRentalWizard`'s inline scan mode) now show one sentence above the
confidence rows — "Looks good — nothing to review" or "N field(s)
need a quick check" — reusing the already-computed critical-confidence
count instead of making the owner scan each row themselves to notice a
problem.

## Real verification, not just green checks

Generated two synthetic test JPEGs (System.Drawing, not a real ID
photo) to exercise the actual pipeline in the browser, not just the
unit-tested math in isolation:

- A flat, near-white image → correctly flagged **both** blur and glare
  ("Photo looks blurry and has glare — hold steady, avoid direct
  light, and retake"), with working Retake/Use-anyway buttons.
- A high-contrast checkerboard using pure black/white — correctly
  flagged **glare only** (not blur), because pure-white cells really
  do read as blown-out luminance; a milder-contrast checkerboard
  (gray 180/60, still sharp edges, no blown-out pixels) correctly
  triggered **neither** warning and proceeded straight through
  crop/compress/extraction with zero extra click.
- The clean image's extraction call then surfaced a real
  `"No AI provider is configured. Set OPENAI_API_KEY or
  ANTHROPIC_API_KEY"` error (this local dev environment has no AI
  provider key set) — confirming the new **Retry** button appears and
  correctly re-sends the same already-processed file. Zero console
  errors across all three test images.

**What wasn't reachable**: an actual successful extraction against a
real ID photo, since no AI provider key is configured in this
environment — the same class of "not exercised against real
infrastructure" limitation every AI-touching phase since the original
roadmap's phase 03 has had, not something this phase introduced.
