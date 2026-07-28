# Guided pickup/return upgrade: AI damage detection

Roadmap phase 15 — bible Chapter 4 §8-9 ("Vehicle Inspection," "Damage
Documentation") and Chapter 6 §6-7 ("Vehicle Pickup Workflow," "Vehicle
Return Workflow"). An intelligence upgrade of the existing pickup/return
inspection workflow (phases unrelated to this roadmap's numbering built
it originally) — no new workflow, no changes to the wizards' step
structure or navigation.

## Two independent pieces

This phase is really two separate features that happen to share a
migration:

1. **Required-photo completeness** (requirements 1 and 5) — a hard gate.
2. **AI damage comparison** (requirements 2-4, 6) — a soft suggestion.

They're kept conceptually and technically separate on purpose: one is a
data-quality guarantee enforced at the database layer, the other is an
AI opinion that can be wrong and must never block anything.

## Required-photo completeness

`PHOTO_SLOTS` was previously defined identically-but-separately in both
`pickup-wizard.tsx` and `return-wizard.tsx` — extracted to
`lib/inspections/photo-slots.ts` as the single source of truth (front,
rear, driver_side, passenger_side, interior, dashboard_odometer,
fuel_gauge). This is a **deliberate scope limit**: the bible's own
fuller sequence lists up to 13 angles (front-left, rear-left, etc.);
expanding to that granularity would be a separate, larger UI change and
wasn't what this phase's own instruction asked for ("verify against
what exists today; if angle coverage isn't already enforced, add a
completeness check" — not "redesign the angle set").

`lib/inspections/rules.ts#missingRequiredPhotoSlots()` is a pure mirror
of a matching hard check added to `complete_inspection()` in
`20260802090000_inspection_photo_completeness.sql` — the same
belt-and-suspenders pattern this function already used for
odometer/fuel-level (client-side pre-check for a fast, specific message;
database-side enforcement so nothing can bypass it). Both wizards now
show `"Missing required photos: rear, fuel gauge."` before ever calling
the completion RPC, matching the bible's own example ("You forgot to
capture the rear of the vehicle") almost verbatim.

**A real, existing escape hatch is preserved, not reopened**: owner/manager
can already override a failed completion with a documented reason
(`canOverride`/`showOverride` in both wizards, pre-existing). The new
photo check raises through the exact same `completeResult.error && !reason`
branch the odometer/fuel checks already used, so it inherits the same
override semantics automatically — no wizard-logic change needed beyond
the new pre-check itself.

## AI damage comparison — a suggestion, never a verdict

**This cannot be emphasized enough, and shaped every design choice
below**: a vision model comparing two ordinary phone photos taken in
different lighting, at a slightly different angle, will sometimes be
wrong — in both directions. `lib/damage-detection.ts#compareInspectionPhotos`
returns a suggestion with a confidence score; nothing about this phase
ever creates a damage record without an employee explicitly clicking
Accept on a specific one. The prompt itself is written to prefer a
lower confidence score over a false positive when the comparison is
ambiguous, directly targeting acceptance criterion 2 ("visually
identical photos must not be falsely flagged — false positives erode
trust fast").

### Bypassing askAI, on purpose

`lib/ai/service.ts#askAI()` only accepts a plain text `prompt` — no
image/attachment support at all, confirmed by reading its full type
contract before writing a line of this phase's code. Rather than
extending askAI's core to support attachments for this one caller (real
risk to every other feature that already depends on its centralized
logging/role-gating/retry behavior), `lib/damage-detection.ts` follows
the exact precedent `lib/document-extraction.ts` already established: a
standalone vision service, calling `generateObject` directly with a
multi-part `content` array. This is genuinely the first **two-image**
model call anywhere in this codebase — `document-extraction.ts` only
ever sends one file per call — but the surrounding pattern
(`resolveVisionModel()`, now exported from `document-extraction.ts` for
this second caller to reuse, mime-type gating, try/catch with a typed
error result) is identical.

**Known, accepted limitation**: this call is not recorded in
`ai_usage_log`, same as `document-extraction.ts`'s calls — centralized
usage logging only covers callers that go through `askAI`.

### The pickup↔return photo join

There is no direct foreign key from a return photo to "the
corresponding pickup photo." `detectReturnDamage`
(`app/(dashboard)/inspections/actions.ts`) does the two-hop lookup:
reservation → its pickup inspection → that inspection's `media` row
where `caption = <angle>`. Angle identity is `media.caption` throughout
this app (confirmed already documented in
`lib/operations-feed/thresholds.ts`) — nothing new invented here.

### When it runs, and how it stays out of the way

Fired from the return wizard's photo-upload handler immediately after
`attachInspectionMedia` succeeds — **never awaited**, so uploading the
next photo or moving to the next step is never blocked on a model
response (requirement 6: "reduce the time spent with the customer").
When a result with `damageDetected: true` comes back, it appears as an
`AiRecommendationCard` in the Damage step — the same component this
codebase already uses everywhere an AI suggestion needs a human's
explicit accept/dismiss (documented in that component itself as "AI may
recommend; a human decides"). The card's own copy is deliberately
hedged ("may show new damage... please check it against the actual
vehicle before confirming") rather than asserting damage exists, and
`ConfidenceIndicator` (already built into `AiRecommendationCard`) makes
a high-confidence flag visually distinct from an uncertain one
(requirement 3).

### No parallel data path

Accepting a suggestion calls the exact same `createDamage` server
action every manually-entered damage already goes through — tagged with
two new, purely additive columns, `damages.source` (`'manual'` default,
`'ai_detected'` when set) and `damages.ai_confidence`. Every existing
caller of `createDamage` is completely unaffected (they simply don't
set these fields, and get the same `'manual'` record as before).
Requirement 4's auto-linking (vehicle, reservation, inspection,
employee, and — indirectly, via the reservation — customer) needed no
new code at all: `createDamage` already wires all of that up for every
damage, AI-confirmed or not.

## Roadmap phase 29 — "Damage Review UX": showing the actual photos

Phase 29's brief asked for five concrete things in the damage-comparison
UI (pickup image, return image, suggested area, confidence, hedged
wording) plus three hard rules (never auto-charge, never auto-confirm,
never present as fact). Re-reading the code before changing anything
found **four of the five "show" items and all three "never" rules were
already true** since phase 15 — `angleLabel` in the observation text,
`ConfidenceIndicator` in `AiRecommendationCard`, the already-hedged "may
show new damage... please check it" copy, and `acceptDamageSuggestion`
only ever firing on an explicit click through the same `createDamage`
path a manual entry uses. **The one real gap**: `detectReturnDamage`
downloaded both photos server-side to run the comparison but never
returned them — the employee could read a description of the damage but
never actually look at the two photos side by side.

Closed narrowly: `DetectReturnDamageResult` now carries
`pickupImageUrl`/`returnImageUrl`, resolved via
`supabase.storage.from(STORAGE_BUCKET).createSignedUrls(...)` — same
1-hour-expiry, never-a-raw-path convention `lib/data.ts#resolveSignedUrls`
already uses everywhere else — but **only when `damageDetected` is
true**, so a clean comparison (the common case) never spends a signed-URL
round trip on images nobody will see. `AiRecommendationCard` gained one
new optional prop, `comparisonImages`, rendering a Pickup/Return
thumbnail pair (each linking to the full-size signed URL in a new tab,
matching `document-list-item.tsx`'s existing convention) — undefined and
invisible for this card's other two consumers (vehicle/customer
recommendations have no photo pair to show).

## Known limitations (intentional)

- **The full pickup/return wizard still can't be walked through live in
  mock mode all the way to the Damage step** — but the reason has moved
  since this doc was last updated. Phase 28 fixed the mount-time crash
  described below (`startInspection` now has an `isSupabaseConfigured`
  guard), so both wizards render cleanly through Step 1/2 in mock mode
  today. The wall is now the **Photos** step: `PhotoUploadGrid` needs a
  real `inspectionId` and live storage to actually accept an upload, so
  in mock mode it renders with zero tiles and the wizard's own
  completeness check correctly keeps `Continue` disabled — confirmed
  directly in the browser on `/reservations/bk_1/return` this phase (Step
  1 → Step 2 both render correctly, odometer/fuel/cleanliness/checklist
  all work, then Photos shows "Missing required photos: ..." with no way
  to satisfy it and `Continue` stays disabled, no console error). This
  means the Damage step's new `comparisonImages` UI could not be
  exercised with a real, wizard-driven damage suggestion this session.
  Verified instead: `npx tsc --noEmit`, `npm run lint`, all 596 vitest
  tests, `npm run build`, and a live browser pass of the new UI itself —
  `AiRecommendationCard`'s `comparisonImages` slot was added as a second,
  synthetic example on `/dev/intelligence-components` (two small SVG
  data-URI placeholders standing in for real pickup/return photos) and
  confirmed rendering correctly in both light and dark mode with zero
  console errors, the same technique phase 22 used to verify OCR review
  UX pieces that couldn't be reached live either.
- **No unit test was added for the new signed-URL resolution itself** —
  it's thin plumbing reusing an already-proven pattern
  (`resolveSignedUrls` in `lib/data.ts`, called from ~10 other places,
  has never had a dedicated test of its own either). `tsc`/lint catch
  real type mismatches; the conditional-on-`damageDetected` cost
  discipline was verified by code review, not a fake-Supabase test.
- **The full pickup/return wizard could not be walked through live in
  mock mode** (original phase 15 finding, now superseded by the note
  above — kept here for history). Both wizards call `startInspection`
  (a Server Action) from a `useEffect` on mount; that action
  unconditionally calls `createClient()`, which throws
  `"Supabase is not configured"` in mock mode exactly like every other
  live-only write action in this app (`createCustomer` had the
  identical issue in phase 14) — except here it fires immediately on
  page load rather than on a button click, so the entire wizard page
  fails before any of this phase's new UI (the photo-completeness
  message, the `AiRecommendationCard` suggestions) can be exercised by
  hand. Verified instead: `npx tsc --noEmit` (which does resolve and
  type-check the actual JSX added to both wizards), `npm run lint`, all
  442 vitest tests (`missingRequiredPhotoSlots` and
  `compareInspectionPhotos` both have dedicated hand-fixture coverage,
  including the acceptance criteria's own two scenarios verbatim), and
  `npm run build` (which compiles and statically analyzes the real
  `/reservations/[id]/pickup` and `/reservations/[id]/return` routes).
  A future phase that wants real interactive verification of either
  wizard would need to give the pickup/return pages the same graceful
  mock-data fallback other pages already have, or apply this repo's
  migrations to a real Supabase project.
- **No end-to-end test against real photos or a real AI provider
  call** — same recurring caveat as every phase since 03. The live
  Supabase project still has migrations 03-15 unapplied, and spending
  real AI credits wasn't judged appropriate for an unprompted local
  session.
- **The required-photo set is the existing 7 slots, not the bible's
  fuller ~13-angle breakdown** — a deliberate scope limit, not an
  oversight (see above).
- **A confirmed AI suggestion always uses `category: "bodywork"` and
  `severity: "minor"`** — matching this codebase's existing manual
  "quick add" defaults in both wizards (unchanged by this phase). The
  AI comparison doesn't classify damage type or severity, only whether
  something changed and how confident it is; an employee can still
  refine category/severity/cost afterward via the existing damage edit
  page, same as any other damage record.
