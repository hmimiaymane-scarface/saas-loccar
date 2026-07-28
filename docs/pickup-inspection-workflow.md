# Pickup Inspection Workflow

Productization wave 3 phase 25 — "make pickup proof quick enough that
people actually use it... the owner cannot accidentally finish without
required evidence."

## What already existed before this phase

Most of the brief's flow was already real, built across roadmap phases
15/16: odometer and fuel level were already required to complete an
inspection (`complete_inspection()`,
`20260719091100_inspection_lifecycle.sql`); all seven photo angles
(front/rear/driver side/passenger side/interior/dashboard odometer/fuel
gauge) were already required at the same DB layer
(`20260802090000_inspection_photo_completeness.sql`, phase 15); adding a
pre-existing damage note during pickup already worked (`PickupWizard`'s
"Note existing damage" button, `createDamage`); a wizard-level "N things
left" strip already existed (`RequirementsSummary`, reused unchanged).

## The real gaps this phase closed

**"Existing damage confirmation" didn't exist as a flow step at all** —
the Existing Damage card only let an employee *add* a newly-noticed
damage; nothing required them to actually look at the vehicle's known
damage list with the customer before finishing. Closed the same way
phase 15 closed the missing-photo gap: a new
`inspections.existing_damage_reviewed` column
(`20260808090000_pickup_existing_damage_review.sql`), required by
`complete_inspection()` for a pickup inspection specifically (a return
inspection is about damage found *during* the rental — phases 28/29's
AI comparison flow — not a re-review of pre-existing damage, so the
column is simply unused there). `PickupWizard` gets a plain checkbox
("I've reviewed the vehicle for existing damage with the customer"),
persisted via `saveInspectionFields`, and `activate()` gets the same
"specific message before the RPC" treatment the photo check already
had.

**A real, silent bug in the required-photo UI**: `PhotoUploadGrid` has
always supported a `required` flag per slot (rendering a "Required"
label when missing) — but `PHOTO_SLOTS`, the single source of truth for
all seven angles, never actually set `required: true` on any of them.
Every angle *was* enforced at completion time, but the UI never said
so. Fixed at the source (`lib/inspections/photo-slots.ts`), not by
patching the call site.

**No combined definition of "is this inspection actually done"** — the
wizard-level `requirementItems`'s "Inspection completed" line only
checked odometer/fuel/cleanliness/overall condition, so it could read
"done" while required photos or the new damage review were still
outstanding, even though `activate()` correctly blocked on those
already. Closed with one new pure function,
`lib/inspections/rules.ts#pickupCompletenessItems` (+
`isPickupInspectionComplete`), now the single source both the
wizard-level strip *and* a new step-level completeness banner
(`RequirementsSummary` reused, not a new component) read from — the two
can no longer silently disagree. Also feeds `resolveInitialStep`'s
resume-after-refresh check, so a returning employee doesn't get parked
past a step that's actually still incomplete.

**Optional additional photos** — no free-form capture existed alongside
the seven fixed, required angles. Added `AdditionalPhotos`
(`components/domain/inspections/additional-photos.tsx`), a small
sibling to `PhotoUploadGrid` built the same way (same
validate/upload/queue-offline shape) but with no slot key, no cap, and
zero effect on completeness — captioned `"additional"` in `media`,
purely "anything else worth a photo."

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run test` (588 tests, 4 new),
and `npm run build` were clean at every checkpoint.

**Real mock-mode browser attempt, honestly blocked at the same wall as
every DB-mutation phase since roadmap phase 04**: `PickupWizard`'s mount
effect calls `startInspection` as soon as the component renders (for any
reservation without an existing inspection), which throws "Supabase is
not configured" against this unconfigured environment. Navigating to
`/reservations/bk_3/pickup` reached the Documents step fine, but
clicking Continue toward Payment/Inspection reliably hit the
"Not available in demo mode" error boundary before Step 3 (Inspection)
ever rendered — confirmed this is the same mount-time rejection
documented in phase 24's own account, not something newly broken by
this phase's changes, and not reliably tied to the click itself (the
timing between the effect's rejection and the click is a race, not a
dependency).

Reservations that already have a completed pickup inspection in mock
data (`bk_1`, `bk_2`, `bk_6`) can't be used to route around this either
— `/reservations/[id]/pickup` redirects away unless the reservation's
status is `request`/`pending`/`confirmed`, and all three have long since
moved past that.

Net result: the new checkbox, completeness banner, and
`AdditionalPhotos` control were not directly observed rendering inside
the live wizard this session. Correctness rests on: a clean tsc/lint
pass, hand-fixture unit tests for the new pure completeness logic
(covering "everything done," and each of odometer/photos/damage-review
missing independently — including the case of zero damage on file,
which still requires the review checkbox), and the fact that both new
UI pieces are thin reuses of already-live-verified patterns —
`RequirementsSummary` (proven correct at the top of this exact wizard
since phase 16) and the plain-checkbox pattern already used and visually
confirmed in `contract-signature-section.tsx`.
