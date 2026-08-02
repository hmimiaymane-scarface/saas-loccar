# Post-Pilot Product Pass

Roadmap phase 69. Brief: "Fix what actual owners reveal." Priority
order: workflow blockers, confusing UI, speed, reliability, missing
daily operational action, nice-to-have requests. "Done when: the
second pilot is materially easier than the first."

## Context: no real pilot feedback exists yet, live

Before any product work, a routine check of the live Supabase project
(read-only, via the service-role key already in `.env.local`) found
that five migrations built and mock-tested across phases 58, 59, 63,
64, and 66 — `usage_events`, `operational_events`, `pilot_feedback`,
`product_signals`, and phase 66's launch-performance-gate extensions —
were never actually applied to the live database, which is still at
the phase-49 migration level. In a real deployment this means the
`/support` feedback form and the entire `/platform/analytics`,
`/platform/operations`, `/platform/product-signals`, and
`/platform/launch-gate` founder-facing surfaces would be non-functional
against live data.

This is exactly why "actual owner feedback" doesn't exist to review
yet — the pipe that would carry it was never connected. Applying those
five migrations is tracked as its own follow-up task (the account
holder is handling the live database connection directly); this phase
did everything else, per instruction, without touching the live
database.

## The real bug: "this month" is always compared against a full "last month"

With no live pilot feedback available, this phase's audit was a
first-principles review of every screen a returning owner opens daily,
the same kind of pass phase 53 (Empty-State and First-Week Experience)
did for a brand-new owner. The first screen checked — mobile Home,
the "Hi, {name}. Today's work" surface — immediately showed: **"Slower
month: revenue is down 100%"** directly above **"Nothing needs you
right now."** Two adjacent panels contradicting each other on the
single most-viewed daily screen is as clear a "confusing UI" (and
arguably "workflow blocker" — a real owner reading "down 100%" could
panic, discount prices, or call support over nothing) finding as this
phase could hope to surface.

The root cause: `resolveReportPeriod("this_month", tz)` returns
`[1st of this month, 1st of next month)` — a range that, in practice,
is always a **partial, month-to-date** window, since no company can
have recorded revenue for days that haven't happened yet. Every
"this month vs. last month" comparison in the app paired that partial
range against `resolveReportPeriod("last_month", tz)`, which is a
genuinely **full** month. Two days into August, that's comparing 2
days of revenue against 31 — a structurally guaranteed "crash" every
single month, worst right after the 1st, however healthy the business
actually is. This affected three call sites, all discovered by tracing
every caller of `resolveReportPeriod("last_month", ...)`:

- Mobile Home's revenue pulse headline (`computeRevenuePulseHeadline`).
- Desktop Overview's Business Pulse score and Revenue Intelligence card
  (`computeBusinessPulse`, `computeRevenueIntelligence`) — the same
  `lastMonth` variable also feeds the new-customers and
  reservation-count deltas on that page, so all of them were affected
  at once.
- A vehicle detail page's cost-trend snapshot strip (`computeCostTrend`),
  comparing this-month-so-far expenses against a full last month —
  same distortion, opposite direction (costs look like they crashed
  early each month, since not all of the month's bills have posted yet).

## The fix: compare against the same number of elapsed days, not the full month

Added `resolveComparableLastMonthPeriod(timeZone)` to `lib/reports.ts`
— last month's range truncated to the same number of days elapsed so
far this month (today's day-of-month), capped at last month's own
length so the comparison naturally falls back to the full month once
this month catches up to or passes it (e.g. comparing day 31 against a
30-day month). `resolveReportPeriod("last_month", ...)` itself is
untouched — it's also a real, user-selectable report period in its own
right (Reports page, a vehicle's own period selector), not just an
automatic comparison baseline, and changing its meaning there would
have been wrong.

Swapped in at the three comparison call sites above
(`app/(dashboard)/home/page.tsx`, `app/(dashboard)/overview/page.tsx`,
`app/(dashboard)/fleet/[id]/page.tsx`) — each keeps calling
`resolveReportPeriod("this_month", tz)` unchanged and only replaces how
its `lastMonth` comparison variable is computed. Verified live in
mock mode on mobile Home: the false "down 100%" banner is gone,
replaced by an honest absence of a headline rather than a fabricated
crash (mock fixture data for the first couple of days of each month
being sparse on both sides of the comparison). The Overview and
vehicle-detail call sites use this project's existing, documented
live-Supabase-only intelligence path (`loadIntelligenceExtras`, phase
13) and so can only be confirmed by code review and the unit tests
below, the same accepted limitation every phase touching that path has
carried since it was built.

## What was investigated and ruled out

The Calendar page's fleet timeline rendered completely empty across
every vehicle for the full displayed week, despite Overview reporting
6 currently-rented vehicles and one severely overdue return — looked,
at first glance, exactly like the kind of workflow-blocking bug this
phase exists to find. Traced to `lib/mock/bookings.ts`: every fixture
booking has a hardcoded, fixed 2026-07 date range, authored when this
project's "today" was mid-July. Now that real time has moved to
August, the entire mock dataset is calendar-expired relative to the
live clock — a mock-fixture staleness artifact, not a product bug. A
real owner's reservations are never date-anchored like this; nothing
here would ever affect a real pilot account. Left alone rather than
"fixed," since refreshing fixture dates is dev-infrastructure upkeep,
not a real-owner-facing product issue this phase's brief covers.

## Verification

tsc/eslint/815 tests (3 new, covering the new
`resolveComparableLastMonthPeriod` invariants: starts on last month's
1st, never exceeds the full last-month range, spans exactly the same
number of elapsed days capped at last month's length)/build all clean.
Live mock-mode check on mobile Home confirmed the fix; the Overview and
vehicle-detail paths were verified by code reading and unit test only,
per this project's standing live-Supabase-only limitation for that
particular code path.

## Deferred

Applying the five outstanding migrations to the live database — see
"Context" above. Tracked as its own task, not part of this phase's
scope.
