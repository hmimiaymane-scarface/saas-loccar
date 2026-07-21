# Business Command Center

Roadmap phase 13 — bible Chapter 10, "the most important screen in
RentalOS... not a dashboard... the operational heartbeat of the
company." An intelligence upgrade of the existing, already-good-looking
`/overview` page, not a rebuild — `TodayTimeline`, `FleetVisualGrid`,
`NeedsAttentionCard`, `FinancialSummaryCard`, `BookingRequestsCard`,
`ActivityFeedCard` are all preserved exactly as they were.

## The five-level hierarchy, and one design decision that ties it together

Requirement 1 asks for a fixed top-to-bottom priority order (Critical →
Today's Operations → Business Health → Opportunities → Historical
Analysis) and requirement 4 separately asks for the phase 12 Operations
Feed to be the primary home for AI-surfaced items. Rather than building
two parallel "what matters" systems, the feed's own four priority tiers
(`critical`/`operational`/`business_health`/`informational`, from phase
12) map almost exactly onto the hierarchy's action-relevant levels —
`critical`→Level 1, `operational`→Level 2, `business_health`→Level 4.
`getOpenOperationsFeedItems()` is called once and sliced by tier;
`informational`-tier items aren't placed on this page at all (still
visible on the full `/operations-feed` page) — surfacing them here
would compete with everything else for attention, which the bible
explicitly warns against.

```
Level 1  Critical        NeedsAttentionCard (existing) + feed.critical
Level 2  Today's Ops     TodayTimeline + FleetVisualGrid (existing, untouched) + feed.operational
Level 3  Business Health BusinessPulseGrid + RevenueIntelligenceCard + HealthOverviewCard x2
Level 4  Opportunities   feed.business_health
Level 5  Historical      FinancialSummaryCard + BookingRequestsCard + ActivityFeedCard (existing)
```

**A deliberate, honest overlap, not a hidden bug**: `NeedsAttentionCard`
(via `getLiveAlerts`, predates this phase) and the operations feed's
`expiring_document` observer (phase 12) can both flag the same expiring
insurance policy — two systems, one real-world condition. Merging or
deduplicating them would mean either rewriting `getLiveAlerts` (a
non-goal — it already works) or teaching the operations feed to know
about live-alert state (real cross-system coupling for marginal
benefit). Accepted as a minor, occasional double-mention rather than
either of those — `getLiveAlerts` still uniquely covers real concerns
the feed doesn't (overdue rentals, unpaid balances, unresolved
deposits, a vehicle in maintenance with an upcoming booking), so it
earns its place as a separate Level 1 source on its own merits, not
just as legacy.

## Morning Briefing (requirement 2)

Plain sentences, not a second dashboard — the bible's own example is
about 10 lines, and `MorningBriefing` stays close to that: today's
pickup/return/maintenance counts, fleet occupancy + this month's
revenue, and the top 3 open operations-feed items (already sorted by
priority — never a separately-invented recommendation list). No chart,
no table, no interactive element.

## Business Pulse (requirement 3)

`lib/business-pulse.ts`, built in an earlier checkpoint this phase —
see that file's own doc comment for the full threshold rationale
(10% trend band for customers/reservations/revenue, `lib/tone.ts#scoreBand`
reused for fleet health, 15%-of-monthly-revenue cash-flow ratio). "Team"
is deliberately factual (active/pending counts) rather than a judgment
label — this app has no shift-scheduling concept for "on schedule" to
honestly mean anything against.

## Revenue Intelligence (requirement 5)

`lib/revenue-intelligence.ts` — "what changed and why," using figures
`getFleetPerformanceReport`/`getReservationPerformanceReport` already
compute (their own `occupancyRate`/`averageDurationDays`), called twice
by the overview page (this month, last month). A driver is only ever
named when its own delta clears a real threshold — a revenue swing
with nothing above threshold says so plainly ("no single obvious
driver") instead of reaching for an explanation that isn't backed by
the numbers.

## Fleet Health Overview & Customer Health (requirement 6)

`lib/intelligence-rollups.ts` — the first general-purpose bulk
(company-wide) reads of `vehicle_intelligence`/`customer_intelligence`;
before this phase only phase 12's observer job read these tables in
bulk, for a different shape. `HealthOverviewCard` reuses the exact same
`ScoreIndicator` every per-entity Overview card already uses, so the
Healthy/Needs Attention/Critical vocabulary is identical whether you're
looking at one vehicle or the whole fleet. Renders nothing when there's
no computed intelligence yet, rather than a misleading zero.

## Search as a universal command (requirement 7)

The header's "Search… ⌘K" button was **completely decorative** before
this phase — confirmed by reading `components/layout/header.tsx` in
full: no click handler, no dialog, no keyboard listener, no `cmdk`
package, no `globalSearch` function anywhere. `lib/search.ts` +
`components/domain/search/command-palette.tsx` are a genuine new
build, not an extension of something partial. One parallel `ilike`
query per entity type (vehicles by plate/make/model, customers by
name/phone, reservations by reference, contracts by contract number,
active documents by filename, employees by name), a plain dialog over
radix-ui's already-installed `Dialog` primitive — deliberately not the
`cmdk` package, since nothing here needs virtual scrolling or nested
command groups. Wired to both header search buttons and a global
Cmd/Ctrl+K listener.

## No widgets (requirement 8)

Every section on this page is fixed — there is no drag-to-rearrange,
no show/hide toggle, no per-user layout preference stored anywhere.
The bible's own instruction is explicit that the platform decides what
deserves attention, not the user arranging tiles; this was the one
requirement that took active resistance to a natural urge to add "just
one" customization option, and none was added.

## Known limitations (intentional)

- **Business Pulse / Revenue Intelligence / Health Overview /
  Operations Feed slices are all live-Supabase-only** — `loadIntelligenceExtras()`
  degrades to safe empty defaults in mock mode in one place (same
  convention as every AI/database-only feature since phase 06),
  verified live in the browser: the Morning Briefing, `NeedsAttentionCard`,
  `TodayTimeline`, and `FleetVisualGrid` all render correctly with real
  mock data, and the page cleanly skips straight from the fleet grid
  to the Level 5 Historical section with no visual gap or console
  error when the Level 3/4 intelligence sections have nothing to show.
- **Search is also live-only** — the command palette's shell (dialog,
  placeholder, "type at least 2 characters" empty state) was verified
  live in the browser in both themes; an actual query in mock mode
  reproduces the same "Supabase is not configured" failure every other
  live-only action in this app already has since phase 04 — not a new
  regression.
- **The `getLiveAlerts`/operations-feed overlap** described above is a
  deliberate, accepted tradeoff, not an oversight.
- **The `NeedsAttentionCard`/`getLiveAlerts`/`getOverviewMetrics`
  underlying data and every new bulk-intelligence read all depend on
  migrations from phases 03-12 that haven't been applied to the live
  Supabase project** — same recurring situation as every phase since
  03. The full Business Pulse/Revenue Intelligence computation
  (real month-over-month numbers, real thresholds) was not exercised
  against real Postgres for this reason — the underlying pure modules
  (`business-pulse.ts`, `revenue-intelligence.ts`, `intelligence-rollups.ts`'s
  `summarizeScores`) are hand-fixture tested instead.
