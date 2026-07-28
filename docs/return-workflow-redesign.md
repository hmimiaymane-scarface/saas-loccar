# Return Workflow: End-to-End Redesign

Productization wave 3 phase 28 — "make closing a rental as smooth as
starting one... return is one continuous flow."

## What already existed before this phase

Unlike its sibling, phase 18 (which rebuilt the rental-*start* flow from
7 pages across 3 route trees into one wizard), the return side was
already there. `ReturnWizard` (`components/domain/returns/return-wizard.tsx`)
is a single 5-step wizard on one URL (`/reservations/[id]/return`) —
completing a return took 2 page loads total (the wizard, then the
redirect to the reservation page) before this phase, already close to
the brief's target shape. Reading the code confirmed 7 of the brief's
11 flow steps were already fully implemented and are untouched by this
phase: opening today's return (via the Today Timeline or the reservation
page's "Manage return" button), return photos/odometer/fuel capture,
AI damage comparison (`detectReturnDamage`, wired since the original
roadmap's phase 15) with an existing Accept/Dismiss review UI, deposit
return/retention (`returnDeposit`/`retainDeposit`), closing the rental
(`completeRentalAction`), and the vehicle-availability update it
performs.

## What was built

Four narrow, real gaps, closed one per checkpoint:

**1. Return-side completeness rule.** Pickup has had
`pickupCompletenessItems`/`isPickupInspectionComplete`
(`lib/inspections/rules.ts`, phase 25) as the single source of truth for
"is this inspection actually done" — return had no equivalent. Its own
`requirementItems` hand-rolled `Boolean(odometerKm && fuelLevel &&
cleanliness && overallCondition)`, which never checked required photos
were captured at all. Added `returnCompletenessItems`/
`isReturnInspectionComplete`, mirroring pickup's shape (odometer, valid
against the pickup reading via the existing `isValidReturnOdometer`,
fuel level, required photos), wired into both the wizard-level strip and
a new step-level `RequirementsSummary` on the Inspection step, so the
two can't silently disagree the way pickup's phase-25 fix addressed for
its own side.

**2. `MoneySummaryCard` in the return wizard.** `PickupWizard` already
reuses this shared card (phase 24 — rental price/extras/total/paid/
remaining/deposit, one glance, no jumping between boxes). `ReturnWizard`'s
charges step instead showed one bare "Current balance … remaining" line.
Wired the same card in above the "Additional charges" card, deriving
`extrasMad` as the delta between the session's live payment state and
the reservation's original snapshot — no changes needed to `submitCharge`.

**3. `justCompleted=1` banner + next-booking wiring (step 11).**
Completing a return just redirected to the plain reservation detail
page with zero acknowledgment of what's next for the vehicle. Added
`ReturnCompletedBanner`, mirroring phase 27's `RentalStartedBanner`/
`justActivated=1` mechanism exactly — same emerald card shape, same
query-param idiom on the wizard's post-completion redirect, no new
route, no toast library, no dismiss control. It shows only vehicle,
customer, and the vehicle's next confirmed/pending booking (or "no
upcoming booking yet"), reusing `lib/data.ts#getFleetCardContext`'s
existing `nextReservation` query for a single vehicle rather than a new
lookup — that function already has a correct mock/live dual-branch
implementation and is already called unguarded elsewhere (the Fleet
page). Deliberately minimal: phase 30 ("Return Completion Reward") is a
separate, later phase that owns the richer summary (revenue, rental
duration, deposit result, vehicle state) — this banner and that one are
two separate, later-composed pieces, the same split phase 18/27 already
established for the rental-start side.

**4. Unblocked live verification of the above.** `startInspection`
(`app/(dashboard)/inspections/actions.ts`) fires from a mount-time
`useEffect` in both `PickupWizard` and `ReturnWizard`, with no
mock-mode guard anywhere — crashing the whole page into the generic
error boundary before any wizard UI ever rendered (a known,
already-documented issue, `docs/damage-detection.md`). Added the same
`isSupabaseConfigured` guard phase 14 already established as precedent
for `globalSearchAction`, scoped to `startInspection` only. Behavior is
byte-for-byte unchanged when a real Supabase project is connected; only
mock mode changes, from a hard crash to a graceful inline message —
strictly better for `PickupWizard` too, not just this phase.
**Deliberately not fixed**: the other 5 unguarded actions in the same
file (`saveInspectionFields`, `completeInspectionAction`,
`completeRentalAction`, `recordPayment`, `returnDeposit`,
`retainDeposit`) and `detectReturnDamage` — fixing all of them is a
separate, larger cleanup (the same "~20 other actions app-wide" class
phase 8's failure registry already catalogued), out of this phase's
scope.

## Real verification, and its honest limit

`npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`
clean at every checkpoint. 596 tests passing (5 new — the return-side
completeness rule's unit tests, mirroring the existing pickup-side
tests' style exactly).

**What was verified live in mock mode**: the return page no longer
500s/crashes at `/reservations/{active-no-return-inspection}/return`
(checkpoint 1's fix, confirmed by loading `bk_1`'s return page before
and after) — the wizard-level and step-level completeness strips both
render correctly, starting at "3 things left" and updating live as
fields are filled (confirmed the below-pickup-odometer rejection and the
strip dropping to "1 thing left" as fields were completed). The
`justCompleted=1` banner was confirmed at `/reservations/bk_2?justCompleted=1`
(a real completed mock reservation) in both light and dark themes —
vehicle, customer, and the "no upcoming booking" fallback line all
correct, zero console errors. Mock fixtures have no completed
reservation whose vehicle also has a future confirmed/pending booking,
so the banner's "has a next booking" branch was not directly observed
live this session — verified instead by reading `getFleetCardContext`'s
already-tested mock-branch logic directly, which the banner consumes
unchanged.

**What was not verified live, and why, stated plainly**:
`MoneySummaryCard`'s actual step-3 pixels inside `ReturnWizard`
(checkpoint 2) were not reachable — checkpoint 1's guard fix only
prevents the mount-time crash, it doesn't fabricate a working mock
inspection, so `saveInspectionStep()` still no-ops without a real
`inspectionId` and the wizard can't advance past step 1 in mock mode.
This is the same recurring mutation-wall limitation every DB-touching
phase has documented since the original roadmap's phase 04. Correctness
there rests on a clean type-check plus reusing an already-live-verified
component (phase 24) completely unchanged, just with different prop
values.

## Known limitations (intentional)

- No live Postgres/Supabase access in this environment — a repo-wide
  constraint since phase 03, not specific to this phase.
- Phase 30's fuller "Return Completion Reward" summary (revenue,
  duration, deposit result, vehicle state) is deliberately deferred, not
  built here — see gap 3 above.
- The 6 other unguarded `createClient()` call sites in
  `app/(dashboard)/inspections/actions.ts` and its siblings remain a
  known, open gap for a future phase, not silently left unmentioned.
