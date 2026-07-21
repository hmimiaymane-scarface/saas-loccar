# Vehicle intelligence (health, profitability, utilization)

Roadmap phase 06 — the bible's Pillar One, Chapter 5 §7-12. Every
vehicle gets a computed health score/band, a transparent profitability
breakdown, and utilization stats, cached in `vehicle_intelligence`
(one row per vehicle) and shown on the vehicle detail page
(`components/domain/fleet/vehicle-intelligence-card.tsx`).

## The pieces

- `lib/vehicle-intelligence.ts` — pure scoring functions
  (`computeVehicleHealth`, `computeVehicleProfitability`,
  `computeVehicleUtilization`, `splitWeekdayWeekend`) plus
  `buildVehicleIntelligenceInputs`, which bridges raw fetched data into
  those functions' inputs. No Supabase dependency — every formula is
  unit-tested against hand-computed fixtures
  (`lib/__tests__/vehicle-intelligence.test.ts`).
- `lib/vehicle-recommendations.ts` — the first real caller of phase
  05's `askAI()`. Generates up to 4 grounded recommendations from an
  already-computed score.
- `lib/vehicle-intelligence-store.ts` — the database-facing
  orchestrator: `recomputeVehicleIntelligence` gathers one vehicle's
  full history, runs the pure functions, generates recommendations, and
  upserts the cache row; `getVehicleIntelligence` reads the cache
  (computing once, lazily, if nothing's cached yet).

## Health score

Six weighted factors (weights sum to 100, defined once in
`HEALTH_FACTOR_WEIGHTS` so the score and any breakdown UI can't drift
apart): damage history (25), maintenance status (20), inspection
results (20), compliance dates (15), age & mileage (15), downtime (5).
Bands: 85+ excellent, 65+ good, 40+ fair, below 40 poor.

**Two of the bible's ten listed factors have no real data source in
this codebase and are approximated rather than invented:**

- **"Customer complaints"** — there's no dedicated field anywhere
  (not on reservations, inspections, or any support-ticket concept).
  Not computed at all; not silently folded into another factor.
- **"Mechanical condition"** — no standalone field either. Approximated
  by the "inspection results" factor (recent `overallCondition`/
  `cleanliness` ratings) and the "maintenance status" factor
  (overdue/stalled maintenance), not a purpose-built measurement.

Every other factor uses real recorded data: damages (severity-weighted,
pre-existing damages excluded since they're a baseline condition, not a
fleet-management outcome; unresolved damages count at full weight,
resolved ones at half), maintenance overdue/stalled status, the most
recent 5 inspections, insurance/registration/inspection expiry dates
(worst of the three: expired = 0, expiring within 30 days = 50, valid
= 100), a simple linear age/mileage degradation curve, and the
idle-days-to-tracked-days ratio.

## Profitability

All-time (not period-scoped like the existing reports feature — see
below), rental income minus every recorded cost category the bible
lists, presented as a breakdown so an owner can see where the number
came from, not just trust a final figure:

- Rental income — same `recordedRevenueMad` definition as
  `lib/data.ts#getFleetPerformanceReport` (sum of `rental_payment`
  transactions), so this and the existing reports feature never
  disagree about what "this vehicle's revenue" means.
- Maintenance, insurance, cleaning — summed from `expenses` by
  category, same source `getFleetPerformanceReport`'s
  `maintenanceCostMad` already uses.
- Damage repairs — summed from `damages.actual_cost` (falling back to
  `estimated_cost`). **Simplification**: this is the gross repair cost,
  not netted against any customer reimbursement (a `damage_charge`
  payment, if one exists, shows up separately as revenue elsewhere) —
  netting them would require attributing specific payments to specific
  damages, which isn't tracked today.
- Other recorded expenses — every other expense category (fuel, tolls,
  fines, parking, etc.) tied to this vehicle.
- Estimated downtime cost — idle days × daily rate, explicitly flagged
  `isEstimate: true` in the breakdown (an opportunity-cost estimate,
  never presented as a recorded transaction the way the others are).

**Why this is a separate calculation from the existing "Financial &
operational summary" card** (`vehicle-economics-card.tsx`,
`lib/reports.ts#resolveReportPeriod`): that feature is a period-scoped
report (today/this week/this month/custom), answering "how did this
vehicle do in a selected window." This is a standing, all-time score
recomputed on events, answering "what's this vehicle's overall story" —
a different question, deliberately not the same code path, though both
share the same underlying revenue/expense definitions.

## Utilization

Reuses `lib/reports.ts#occupancyRate`/`downtimeDays` directly (with
`fleetSize=1`, since this is a single vehicle) rather than a parallel
definition — this codebase's existing rule is "the overview, reports,
vehicle details and CSV exports must use the same definitions."
Weekday/weekend split (`splitWeekdayWeekend`) counts calendar days
using UTC day-of-week, a coarse approximation rather than the company's
own timezone — acceptable for a rough split, not used for anything
billing-related.

"Total days tracked" (the occupancy denominator) is: `acquired_on` if
set, else the earliest counted reservation's pickup date, else a 1-day
fallback — so a brand-new vehicle with no history yet never divides by
zero.

## Recommendations

`generateVehicleRecommendations` builds a prompt entirely from the
already-computed health/profitability/utilization numbers (the model
never sees raw vehicle data directly, only the score breakdown) and
asks for up to 4 observation/reasoning/suggestedAction items via
`askAI()`. Advisory only — nothing here writes to any operational
table; the bible's non-negotiable "AI may recommend. Humans decide."
Rendered via phase 02's `AiRecommendationCard`, which has its own
Accept/Dismiss buttons — not yet wired to anything (no persisted
accept/reject exists yet; that's separable future work, not required by
this phase).

Allowed for owner/manager/agent — the union of every role that can
trigger a recompute in the first place (see below), not the narrower
set a first instinct might reach for. See the rationale comment on
`generateVehicleRecommendations` for why.

## Recompute triggers (requirement 5)

No background job infrastructure exists anywhere in this codebase (see
`docs/documents.md`), so recomputation is synchronous, triggered
inline from the three actions that emit the relevant events, and
best-effort (`recomputeVehicleIntelligenceBestEffort` — a scoring
failure never fails the real mutation that caused it):

- `completeRentalAction` (`app/(dashboard)/reservations/actions.ts`) →
  reason `"vehicle_returned"`
- `completeMaintenanceAction` (`app/(dashboard)/maintenance/actions.ts`)
  → reason `"maintenance_completed"`
- `createDamage` (`app/(dashboard)/damages/actions.ts`) → reason
  `"damage_recorded"`

A vehicle that's never triggered any of these (brand new, or simply
never viewed since its last event) computes lazily on first read
(`getVehicleIntelligence`, reason `"initial_view"`) rather than showing
nothing — but that first read then caches, so it isn't recomputed again
on every subsequent page view.

## Known limitations (intentional, for a future phase)

- **No full Vehicle Command Center yet.** This phase only adds enough
  UI to see a score on the vehicle detail page — the bible's full
  Chapter 3 §5 (Timeline, Maintenance, Damage History, Revenue,
  Utilization, Expenses, Insurance, Documents, Inspections,
  Reservations, AI Insights as dedicated sections) is phase 07.
- **No fleet-wide rollup.** Aggregating these scores across the whole
  fleet belongs to phase 13's Command Center.
- **Recommendations aren't actionable yet.** Accept/Dismiss render but
  don't persist or do anything — same "advisory only" scope as the
  bible requires for this phase; a real accept/reject flow is separable
  future work.
- **Damage cost isn't netted against reimbursement** — see the
  Profitability section above.
- **The `vehicle_intelligence` migration hasn't been applied to the
  live Supabase project** — same recurring situation as every prior
  phase's new tables in this environment (no Docker/Supabase CLI
  available locally). Verified instead via unit tests (mocked Supabase
  client, hand-computed fixtures) and a real mock-mode browser pass
  confirming the vehicle detail page still renders correctly with the
  card absent (as designed) when there's no Supabase client to query.
