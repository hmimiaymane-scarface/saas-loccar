# Business Gamification Layer

Wave 4 phase 31 — "make the product feel alive, not like an ERP." Goal:
turn operational data already in this app into reasons to check it, while
explicitly avoiding coins/XP/cartoon rewards/childish badges (the brief's
own stated non-goals). Not a new subsystem — a thin composition layer over
data other phases already compute.

## What was already true before this phase

- **"Month vs last month"** — `computeRevenueIntelligence`
  (`lib/revenue-intelligence.ts`, phase 13) already produces exactly this
  headline, already rendered via `RevenueIntelligenceCard` on `/overview`.
  This phase does not rebuild it or duplicate the fact on the same page —
  `PerformanceHighlightsCard` deliberately never includes a
  month-vs-last-month line.
- **Per-vehicle revenue/rentals/utilization data** — `getFleetPerformanceReport`
  (`lib/data.ts`) already returns a full `rows: FleetPerformanceRow[]` (per
  vehicle: `recordedRevenueMad`, `reservationCount`, `rentalDays`,
  `downtimeDays`) for the current month. The Overview page's
  `loadIntelligenceExtras` already fetched this for its `occupancyRate`
  aggregate — the `rows` themselves were computed and thrown away every
  page load before this phase.

## What's new

**One new query**: `getTrailingMonthlyRevenue(companyId, months, timeZone)`
(`lib/data.ts`), backed by `resolveTrailingMonths(count, timeZone)`
(`lib/reports.ts`, pure calendar math, mirrors `resolveReportPeriod`'s own
style) — a contiguous, company-timezone-correct series of calendar months
ending at the current one. One query spans the whole trailing window (12
months, `GAMIFICATION_TRAILING_MONTHS`), bucketed by month client-side via
`utcIsoToZonedLocal(paidAt, tz).slice(0, 7)` — not one query per month, the
same batching discipline every other multi-row lookup in this file follows.
Nothing before this phase needed more than two periods (current + prior);
"personal best" and "revenue streak" both need a real history.

**`lib/gamification.ts`** (new, pure, no Supabase — hand-fixture tested,
21 tests):
- `buildVehicleLeaderboard(rows, periodDays)` — top vehicle by revenue, by
  rentals, by utilization, plus the single most-idle vehicle this month.
  **Never crowns a zero-activity vehicle** — a `topRevenue`/`topRentals`/
  `topUtilization` entry only exists when its value is genuinely `> 0`.
- `computeRevenueRecord(series)` — the current month counts as a record
  only when it's `>=` every *prior* month in the series, and only when
  there's at least one prior month to compare against (a brand-new
  company with one month of history is never told it "just hit a
  record" — nothing to be a record *against* yet).
- `computeRevenueStreak(series)` — consecutive months (walking backward
  from the most recent) each strictly greater, or strictly less, than the
  one before — a flat month breaks it either way. Only ever reported at
  `length >= 2`; a single month's move is not a streak. **Caught a real
  off-by-one bug in its own first draft** before it ever ran against real
  data: the initial version re-counted the same transition twice (once to
  derive `direction`, once again as the loop's first iteration), inflating
  every streak length by one. Found by its own unit test
  (`counts a genuine growth run correctly (3 consecutive increases)`)
  failing during this same checkpoint — fixed before commit, not after.
- `buildPerformanceHighlights(leaderboard, record, streak)` — composes all
  of the above into plain factual sentences ("Top vehicle by revenue this
  month: Dacia Duster (1234-A-5) — 5.000 MAD.", "Revenue has grown for 3
  straight months."). This is where "no coins/XP/badges" actually gets
  enforced structurally — every entry is a sentence plus an icon key, the
  component below has no room to add game-like chrome even if it wanted
  to.

**`components/domain/overview/performance-highlights-card.tsx`** (new) —
purely presentational: maps each highlight's icon key to a small
monochrome lucide icon (`Trophy`/`Repeat`/`Gauge`/`Moon`/`Award`/`Flame`)
and renders the sentence next to it. Renders nothing (not an empty-state
card) when zero highlights qualify — the same "don't show a hollow card"
convention `vehicle-insights-section.tsx` already established.

**Idle-vehicle definition is deliberately narrower than the Operations
Feed's own idle detector.** Phase 12's `evaluateIdleVehicle`
(`lib/operations-feed/observers.ts`) uses a vehicle's real last-activity
timestamp across period boundaries, for an actionable alert. This phase's
"most idle" fact is scoped to *this calendar month only*
(`rentalDays === 0`, ranked by `downtimeDays`) for a stat callout, and is
worded accordingly ("hasn't had a rental in N days **this month**") so it
never implies more precision than it actually has. Two systems, two
purposes, kept separate on purpose — the same pattern phase 13 already
established for `getLiveAlerts` vs. the Operations Feed's own overlapping
signals.

## Wiring

`app/(dashboard)/overview/page.tsx#loadIntelligenceExtras` gains one new
parallel query (`getTrailingMonthlyRevenue`) and computes
`performanceHighlights` from that plus the already-fetched
`fleetPerfThisMonth.rows`. `<PerformanceHighlightsCard>` renders in the
Level 3 ("Business Health") section, right after the Revenue
Intelligence / Health Overview row.

## Known limitations (intentional)

- **Same mock-mode-absent convention as its siblings, not a new gap.**
  `loadIntelligenceExtras` has gated its *entire* return value behind
  `isSupabaseConfigured` since phase 13 — `RevenueIntelligenceCard`,
  `BusinessPulseGrid`, and both `HealthOverviewCard`s are already absent
  in mock mode today, for the same reason (`getOpenOperationsFeedItems`,
  `getFleetHealthRollup`, and several other calls in that same
  `Promise.all` have no mock implementation, unlike `getFleetPerformanceReport`
  itself, which does). `performanceHighlights` joins that same fate rather
  than forcing an inconsistent partial-mock special case. **Verified live
  in mock mode**: `/overview` renders cleanly with the whole Level 3/4
  section absent (no dead gap, no crash), confirmed in both light and
  dark mode, zero console errors on a hard reload.
- **The card's actual populated rendering (real highlight sentences, real
  icons) was not observed live this session**, for the reason above — no
  connected Supabase project exists in this environment, same recurring
  limitation every AI/database-only feature has carried since phase 06.
  Confidence rests on: 21 hand-fixture tests covering every composition
  branch (including the one that caught the streak off-by-one before
  shipping), and the component itself being a thin, direct structural
  match to `MorningBriefing`'s already-live-verified icon+sentence row
  pattern.
- **`GAMIFICATION_TRAILING_MONTHS = 12`** is a first-pass, named constant,
  not a configurable setting — matches this codebase's established
  convention of hardcoded, documented thresholds (trust-score weights,
  health bands, operations-feed thresholds) over new per-company Settings
  fields for a first cut.
