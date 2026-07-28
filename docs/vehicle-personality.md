# Vehicle Personality Without Gimmicks

Wave 4 phase 32. Brief: the vehicle detail page (`/fleet/[id]`) should
summarize revenue this month, utilization, current status, next rental,
cost trend, health, and recent activity, so owners "naturally compare
vehicles and notice underperformance."

## A mid-session direction check, not a silent design call

Partway through this phase the user floated an extra idea — vehicles as
"characters that compete," with XP/levels/stars. That's a direct reversal
of two things already shipped and documented: phase 31's explicit brief
("avoid coins, XP, cartoon rewards, childish badges") and this phase's own
title. Rather than either silently implementing it or silently ignoring
it, the tension was raised back to the user via `AskUserQuestion` with
three concrete options (plain data-driven identity / competitive ranking
with no points / a full reversal to real XP-and-levels). **Resolved as
"competitive ranking, still no XP/points"** — real rank and the
record/streak mechanism phase 31 already built, framed as business
standing, never a game score. Everything below reflects that answer.

## What was already true before this phase

Research found most of the brief already built, spread across cards
phase 06/07 created:

- **Current status** → the prominent badge already in the page header/
  Status card.
- **Health, utilization** (occupancy, idle days, reservations, revenue/day)
  → `VehicleIntelligenceCard`, from `getVehicleIntelligence` — gated:
  absent without a connected Supabase project and a completed recompute,
  same as every AI-advisory element on this page since phase 06.
- **Revenue this month** → `VehicleEconomicsCard`, via
  `getVehicleEconomics(companyId, vehicleId, range)` — already
  period-scoped, defaults to `this_month`.
- **Recent activity** → `EntityTimeline`, via `getActivityLogList(...,
  { vehicleId })`.
- **Next rental** → existed as data (`vehicle.currentReservation`/
  `upcomingReservations`) but only as full list cards further down the
  page, not a single at-a-glance line.

**The real page-level problem** the brief's "Done when" line points at:
all of the above was scattered across 6+ cards requiring scrolling —
nothing tied it into one glanceable unit an owner could compare across two
vehicle pages at a flip. That's the actual gap this phase closes, not
missing data.

## What's new

**`VehicleSnapshotStrip`** (`components/domain/fleet/vehicle-snapshot-strip.tsx`)
— a compact `StatCard` grid right after the AI summary banner, before the
detailed card grid. Reuses `StatCard`, the same "two or three numbers an
owner actually opens the app to check" primitive `HomeSummaryStrip`
already established on `/overview` — same visual language at every zoom
level. Six tiles, each degrading independently:

- Revenue this month, Cost trend, Next rental, Fleet rank — always
  render (their data is always available on this page).
- Utilization, Health — only when `intelligence` exists, the same gating
  every other intelligence element on this page already uses.

**Cost trend** (new): `computeCostTrend(currentMad, priorMad)`
(`lib/vehicle-intelligence.ts`) — this month's recorded expenses vs. last
month's, same percent-change/flat-threshold shape
`lib/revenue-intelligence.ts#computeRevenueIntelligence` already
established for company-wide revenue, just for one vehicle's costs.
Needed one more `getVehicleEconomics` call (the function already existed,
just called with a second `ReportDateRange`) — deliberately independent
of the page's own period selector (which still scopes the separate
"Revenue & expenses" card further down); "this month" here always means
the calendar month, not whatever the selector happens to show.

**Fleet rank + vehicle-scoped record/streak** (new — where the "compete"
direction lives):

- `computeVehicleRank(rows, vehicleId)` (`lib/gamification.ts`) — this
  vehicle's position among the whole fleet by revenue this month,
  standard competition ranking (ties share a rank; the vehicle after a
  tied group skips accordingly). `null` when this vehicle has zero
  revenue this month (same "never crown/rank zero activity" rule
  `buildVehicleLeaderboard` already follows) or isn't in the fleet.
  First per-vehicle-page use of `getFleetPerformanceReport`.
- **Reuses phase 31's `computeRevenueRecord`/`computeRevenueStreak`
  completely unchanged** — just fed a *per-vehicle* trailing series
  instead of company-wide. `getTrailingMonthlyRevenue` gained an
  optional `vehicleId` parameter for this (one more inner join + a
  client-side filter, the exact same technique
  `getFleetPerformanceReport` already uses for the identical
  filter-payments-by-vehicle need — a dotted `.eq()` on the embedded
  `reservation.vehicle_id` was tried first and rejected: Supabase's typed
  query builder can't parse a conditional select string, and that query
  shape isn't used anywhere else in this file).
- Composed into plain sentences via `buildVehicleHighlights` — "#2 of 3
  vehicles by revenue this month.", "Best month yet: 1.400 MAD.",
  "Revenue growing for 3 straight months." Rendered via
  `PerformanceHighlightsCard` (phase 31), which gained one optional
  `title` prop rather than a duplicate component — cheaper to reuse an
  already-built, already-tested generic card than fork its JSX.

## Known limitations (intentional)

- **Two mock-data quirks found during verification, neither a bug in
  this phase's code**: `veh_2` is hardcoded `status: "rented"` in
  `lib/mock/vehicles.ts` with zero linked bookings anywhere in
  `lib/mock/bookings.ts`, and `veh_4`'s `status: "reserved"` has no
  linked upcoming booking either — both correctly render "Next rental:
  None scheduled" given the data they're actually fed, not a
  derivation bug. Pre-existing fixture inconsistencies, not introduced
  or fixed here (out of this phase's scope).
- **Utilization/Health tiles and the AI summary banner remain absent
  without a connected Supabase project** — same recurring limitation
  every AI-advisory feature has carried since phase 06, not new here.
- **Unlike phase 31's Overview-level integration, this phase's whole
  new snapshot strip + highlights card WAS fully verifiable live** —
  `getVehicleEconomics`/`getFleetPerformanceReport`/`getTrailingMonthlyRevenue`
  are all called unconditionally on this page (no `isSupabaseConfigured`
  gate the way `loadIntelligenceExtras` wraps the Overview page's
  extras), so every tile except the two intelligence-gated ones renders
  with real mock data. Confirmed on `/fleet/veh_2` (no revenue, flat
  cost trend, no rank — correctly all degrade to their empty states) and
  `/fleet/veh_4` (1.400 MAD revenue, flat cost trend, "#2 of 3 vehicles
  by revenue", "Best month yet: 1.400 MAD.") in both light and dark
  mode, zero console errors either time.
