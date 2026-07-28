# Simplify Business Pulse (Mobile Home)

Wave 4 phase 33. Brief: "mobile home should show one or two plain-language
conclusions... analytics answer questions instead of creating homework."

## Nothing to remove — mobile home was already the opposite of overload

`app/(dashboard)/home/page.tsx` (roadmap phase 16) has never rendered a
`BusinessPulseGrid` or anything dashboard-shaped — it's a greeting plus
`MissionFeedList` (task cards), full stop. `BusinessPulseGrid` (phase 13,
8 category tiles) lives only on desktop `/overview`. So there was no
overload to simplify away here; the real, still-open gap was that mobile
home had **zero high-level "how's the business doing" framing at all**,
only a personal task list. This phase adds exactly that, capped at the
brief's own "one or two" sentences, without ever growing into a second
dashboard.

## The two conclusions, and the one set aside

Picked from the brief's three named examples, favoring the two with the
strongest real-data grounding and mock-mode reachability:

1. **Revenue pulse** — `computeRevenuePulseHeadline(currentMad, priorMad)`
   (`lib/revenue-intelligence.ts`), a deliberately *simpler* sibling of
   phase 13's `computeRevenueIntelligence`: no driver breakdown (that's
   homework, not a conclusion — the whole point of this brief), just
   "Strong month: revenue is up 14%." / "Slower month: revenue is down
   9%." / "Steady month: revenue is flat compared to last month." Reuses
   the exact percent-change/flat-threshold constants the existing
   function already established. Returns `null` (not a fabricated
   "Steady month" claim) when both the current and prior period are
   exactly zero — a brand-new company with no revenue history has
   nothing to conclude yet.
2. **Busiest pickup day** — `computeBusiestPickupDayHeadline(counts,
   todayDate, timeZone)` (`lib/mobile/business-pulse-summary.ts`, new).
   Backed by a genuinely new query, `getWeeklyPickupCounts(companyId,
   timeZone)` (`lib/data.ts`) — nothing before this phase counted
   pickups-per-day across a week. One query over
   `resolveReportPeriod("this_week", tz)`'s range, bucketed by local
   calendar date, excluding cancelled/no-show bookings (the same "a real
   booking that's actually still happening" convention
   `getFinancialReport`'s own mock branch already uses). Only reports a
   day once its count clears a named minimum (2 — a single pickup isn't
   meaningfully "busy" in relative terms), and phrases "tomorrow"
   specially when that's the answer.

`buildMobileBusinessPulseSummary(revenueHeadline, busiestDayHeadline)`
composes whichever of the two have something real to say, capped at 2 —
never a forced placeholder line when neither clears its bar.

**Set aside, stated honestly rather than silently dropped**: the third
named example, "N vehicles are sitting idle." `getMobileMissionFeedInputs`
(the mission feed's own data layer) already fetches the Operations Feed's
items but discards every non-reservation-linked one — including
vehicle-linked `idle_vehicle` items — before returning, and that whole
data source has zero mock-mode support today (mock mode always returns
`feedItems: []`). Building this properly means widening an existing,
working function's contract for one new caller, for a conclusion that
couldn't be live-verified in this environment either way. Two
well-grounded, mostly-mock-reachable conclusions beat three where the
third is unverifiable — matches the brief's own "one or two," not "all
three named examples."

## Wiring

`HomePage` gains one new fetch block (`getFinancialReport` × 2,
`getWeeklyPickupCounts` × 1, all parallel) in its own `try`/`catch` —
independent of the existing mission-feed fetch's own `try`/`catch`, so a
failure in either never breaks the other. Renders up to 2 plain `<p>`
lines in a single muted rounded panel between the greeting and
`MissionFeedList` — matching `MorningBriefing`'s own plain-sentence
style on desktop, not a new card component.

## Known limitations (intentional)

- **Real, live mock-mode verification — genuinely the best of this
  wave**: unlike phase 31 (blocked by the Overview page's blanket
  `isSupabaseConfigured` gate), both new queries here have real,
  independent mock-mode branches, so `/home` was fully reachable.
  Confirmed live: "Strong month: revenue is up 100%." rendered correctly
  (this company's mock financial data has real current-month revenue
  against zero prior-month revenue), in both light and dark mode, zero
  console errors. The busiest-pickup-day line correctly did **not**
  render — traced this to the mock booking fixtures themselves
  (`lib/mock/bookings.ts`), whose `startDate`s are all hardcoded to
  specific past dates (2026-07-05 through 2026-07-25) that never fall
  within "this week" relative to the real clock — the same
  fixtures-don't-track-today characteristic other phases have already
  documented (e.g. phase 20's "no completed reservation whose vehicle
  also has a future booking"). Not a bug in this phase's logic — the 9
  hand-fixture tests for `computeBusiestPickupDayHeadline` (including the
  literal "tomorrow" and weekday-naming cases) prove the function itself
  behaves correctly; live verification just couldn't exercise its
  positive branch against this particular mock dataset's stale dates.
