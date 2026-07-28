# Separate Real-Time Operations from Daily Intelligence

Wave 4 phase 34. Brief: stop treating all alerts as once-daily
observations — six named REAL-TIME concerns, six named DAILY/PERIODIC
ones. "Done when: time-sensitive problems appear when they matter."

## Three research findings, not one uniform gap

Read the actual code and migrations behind every named item rather than
assuming the Operations Feed engine (phase 12, cron-only) was the single
thing to fix.

**1. Three of the six REAL-TIME items were already real-time, computed
live on every page load, never cron-batched**: "late return"
(`rental_overdue`) and "payment issue at return" (`outstanding_balance`/
`deposit_unresolved`) both come from `getLiveAlerts` (`lib/data.ts`);
"new booking request" comes from `getRecentBookingRequests`. Neither
goes anywhere near the Operations Feed's daily cron. No changes needed —
confirmed by reading the call sites, not assumed.

**2. "Double-booking risk" is already prevented, not just detected, in
true real time — better than anything a cron job could offer.**
`supabase/migrations/20260718121000_double_booking_protection.sql` adds
a Postgres `EXCLUDE USING GIST` constraint (`reservations_no_overlap`)
on `(vehicle_id, period)` for `pending`/`confirmed`/`active`
reservations. Two overlapping bookings for the same vehicle cannot be
inserted — Postgres rejects it transactionally, even under a race. The
Operations Feed's own `overlapping_reservations` observer (phase 12) is
redundant backup coverage for the one case the constraint's `WHERE`
clause doesn't cover (`vehicle_id is null` — a category-only request,
not yet assigned) — already correctly scoped. Nothing to fix.

**3. A real, previously-undetected bug: `missing_handoff_photos` was
dead code.** `lib/operations-feed/run.ts#gatherInspectionDrafts` only
ever evaluated `evaluateMissingHandoffPhotos` against **completed**
inspections. But `REQUIRED_HANDOFF_PHOTO_SLOTS = ["fuel_gauge",
"dashboard_odometer"]` is a subset of `complete_inspection()`'s own
hard-required slot list (`supabase/migrations/20260802090000_inspection_photo_completeness.sql`)
— an inspection cannot reach `completed` status without both those
photos already captured; the RPC raises a hard exception otherwise, no
override path exists. This observer was valid when phase 12 built it; a
later migration's hard gate quietly made it unreachable, and nothing
was ever updated to match — the same "two systems evolved
independently, one made the other partially dead" shape this roadmap
has surfaced before (phase 19's dead `download_documents` permission
key).

## The fix

The condition is still real — just on **draft** (in-progress)
inspections, not completed ones. That's also exactly the kind of thing
that should surface **the moment it's missing**, not a day later.

**`lib/operations-feed/upsert.ts`** (new) — `upsertOperationsFeedItem`,
the insert/update/leave-dismissed/resolve rule extracted from
`runOperationsFeedForCompany`'s previously-inlined per-draft loop. Both
the daily batch job and the new real-time trigger call this one function
now, so they can never quietly disagree about what "open"/"dismissed"
means for the same entity. `run.ts`'s own behavior is unchanged — the
existing `run.test.ts` suite passes without modification, proving parity.

**`gatherInspectionDrafts`** now fetches only `draft`-status inspections
(previously `["draft", "completed"]`) — `evaluateStaleInspection` and
`evaluateMissingHandoffPhotos` both run against the same rows now,
matching where each condition can actually still be true.

**`lib/operations-feed/realtime.ts`** (new) —
`recomputeMissingHandoffPhotosBestEffort(supabase, companyId,
inspectionId, now)`: recomputes exactly one inspection's missing-photo
status (fetches its own type/reservation reference/captured media
captions, calls the existing pure `evaluateMissingHandoffPhotos`,
reconciles via `upsertOperationsFeedItem`) — not a company-wide run.
Silently no-ops for a non-draft inspection (nothing useful to check).
Best-effort (try/catch, never fails the real mutation), same contract as
`lib/vehicle-intelligence-store.ts#recomputeVehicleIntelligenceBestEffort`.
Wired into `app/(dashboard)/inspections/actions.ts#attachInspectionMedia`
right after a successful upload — staff learn about a missing fuel/
odometer photo while still standing at the vehicle, not up to 24 hours
later via the nightly cron.

## Set aside, stated honestly

- **"Important workflow failure"** — no existing signal source maps to
  this cleanly (it isn't the error-boundary/failure-registry concept
  from phase 08, which catches rendering crashes, not workflow
  failures). Inventing a new failure-detection surface from scratch is
  out of proportion for a phase about re-timing existing signals, not
  building new ones — same disciplined "don't force a guess" call
  phase 33 made for "N vehicles idle."
- **The DAILY/PERIODIC bucket is unchanged** — idle vehicles,
  profitability decline (vehicle health decline observer), expiring
  documents, and customer reactivation (inactive customer observer) all
  already correctly live on the daily cron, confirmed by re-reading
  `run.ts`. "Maintenance trends" doesn't exist as a distinct observer
  today and wasn't invented here — a phase about correcting timing, not
  adding new intelligence surfaces. "Business pulse" is phase 13/33's
  separate mechanism, already appropriately periodic (recomputed per
  page load, not a real-time-critical signal).

## Known limitations (intentional)

- **No live browser/mock-mode verification is possible for this
  subsystem** — `operations_feed_items`/`run.ts` has had zero
  mock-mode support since phase 12 (no `isMockMode()` branch anywhere
  in this file, unlike every report function in `lib/data.ts`); this
  phase doesn't change that. Correctness rests on the existing
  `run.test.ts`/`observers.test.ts` fake-Supabase-client suites (a
  proven, real reconciliation-behavior harness, extended rather than
  reinvented) plus 2 new dedicated test files (`upsert.test.ts`,
  `realtime.test.ts`) and `tsc`/lint/build — the same honest limitation
  every phase touching this subsystem has carried since it was built.
- **A real bug was caught in this phase's own test fixture, not
  shipped**: the first draft of `realtime.test.ts`'s fake Supabase
  client was missing a `.then()` implementation on its plain
  (non-`.maybeSingle()`) query chain, so an `await`ed media-fetch
  silently resolved to nothing rather than the seeded rows — masking
  the real "both photos present -> resolved" behavior as a false
  failure. Caught immediately by the test itself failing, fixed before
  committing, matching this roadmap's own repeated pattern of tests
  catching real problems (this time in the harness, not the feature)
  rather than rubber-stamping green output.
- **No migration was needed** — this phase is entirely application-code
  (a refactor, a status-filter fix, and a new best-effort trigger), no
  new tables or columns.
