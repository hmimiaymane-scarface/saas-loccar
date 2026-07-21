# Vehicle Command Center

Roadmap phase 07 — bible Chapter 3 §5 ("Vehicle Command Center": *"Every
vehicle should have its own operational workspace... The owner should
understand a vehicle within seconds"*) and Chapter 5 §8 ("Every Vehicle
Has a Story" — the unified timeline). This phase reorganizes and
extends the existing vehicle detail page
(`app/(dashboard)/fleet/[id]/page.tsx`); it does not rebuild it, and it
does not touch any of the underlying maintenance/damage/document CRUD
workflows (non-goal).

## No new navigation paradigm

Requirement 5 asks to stay consistent with whatever progressive-
disclosure pattern the page already used, rather than invent a new one.
Audited the whole app first: **there is no `Tabs`/`Accordion` component
anywhere in this codebase**, and no page uses one. The existing (and
only) pattern is: summary cards on the detail page, full detail one
click away via a dedicated sub-route (`/damages/[id]`,
`/maintenance/[id]`, `/inspections/[id]`). This phase keeps that pattern
exactly — it adds and reorganizes cards, it does not introduce tabs or
an accordion.

## What's new

- **AI summary banner** — one/two sentences, generated alongside phase
  06's recommendations (see `lib/vehicle-recommendations.ts#generateVehicleInsights`),
  placed above the two-column grid, not inside a card. This is the
  literal "understand within seconds" element: it's the first thing on
  the page.
- **Timeline** — `components/domain/intelligence/entity-timeline.tsx`
  (phase 02) fed by `lib/data.ts#getActivityLogList({ vehicleId })`.
  **No new query mechanism was built for this** — every reservation-
  and maintenance-lifecycle SQL function (`complete_rental`,
  `create_maintenance`, `complete_maintenance`, etc., in
  `supabase/migrations/20260723090100_event_backbone_functions.sql`)
  already carries `vehicle_id` in the event's `metadata` jsonb by
  design (see that migration's own comment: *"vehicle_id now also
  carried in metadata since it's readily [available]"*), and
  `getActivityLogList` already had a `vehicleId` filter using
  `metadata->>vehicle_id` — phase 01/an earlier session built this,
  this phase just found and reused it. Most-recent-first (not the
  bible's literal ascending purchase→sale example order) — matches
  every other activity feed in this app, which is the stronger
  "coherent, familiar reading order" signal for a UI-consistency
  requirement.
- **AI Insights section** — `components/domain/fleet/vehicle-insights-section.tsx`,
  split out of what was one bundled card in phase 06. Renders nothing
  (not an empty-state card) when there are no recommendations yet.
- **Section relabeling** — existing cards renamed to the bible's
  vocabulary where a natural 1:1 mapping exists: "Maintenance history"
  → "Maintenance", "Recent inspections" → "Inspections", "Files" →
  "Documents", "Compliance" → "Insurance & compliance", "Financial &
  operational summary" → "Revenue & expenses". No underlying data or
  behavior changed, only the `CardTitle` text.

## Overview vs. the existing period-scoped report

The Overview section's scores (`vehicle-intelligence-card.tsx`) are
phase 06's all-time, cached, event-recomputed numbers. The existing
"Revenue & expenses" card (`vehicle-economics-card.tsx`,
`getVehicleEconomics`) is a separate, period-selectable report (today/
this week/this month/custom) that already existed before phase 06.
Both stay on the page side by side, answering different questions
("what's this vehicle's overall story" vs. "how did it do in a
selected window") — see `docs/vehicle-intelligence.md` for why phase 06
kept these as two separate calculations rather than merging them.

## Customer Reviews — omitted, not faked

The bible's section list includes "Customer Reviews." This codebase
has no review/rating concept anywhere — not on customers, reservations,
or anything else. Per the phase brief's own instruction ("if no review
data exists yet, omit rather than fake it — note it as a future gap"),
there is no Customer Reviews card on the page at all; a code comment in
`page.tsx` marks the gap for whichever future phase adds real customer
feedback.

## Performance (requirement 6)

The scores read from phase 06's cache (`getVehicleIntelligence`) —
nothing here recomputes health/profitability/utilization inline. The
timeline query is capped at 20 rows (`getActivityLogList`'s existing
pagination). No new heavy computation was added by this phase; it's
presentation of already-computed/already-queried data.

## Verified in the browser — light and dark

Opened `veh_7` (Dacia Duster — the mock activity fixtures were
extended in this same phase specifically so at least one vehicle has a
real, non-empty timeline) in mock mode, in both light and dark (forced
via `document.documentElement.classList.add('dark')`, since this app
has no in-app theme toggle anywhere — a pre-existing gap noted back in
phase 02, not this phase's job to fix). Confirmed: the Timeline card
renders both mock events in the correct newest-first order with the
right icons, every relabeled card ("Insurance & compliance", "Revenue &
expenses") renders correctly, dark mode has no contrast/legibility
issues, and there are zero console errors in either mode.

**What this pass could not verify**: the AI summary banner, the
Overview scores card, and the AI Insights section are all absent in
mock mode by design (no Supabase client to query
`vehicle_intelligence` through — see `docs/vehicle-intelligence.md`'s
same limitation from phase 06). Their layout/rendering is covered by
`tsc`, `eslint`, the full build, and reuse of phase 02's already
light/dark-verified `ScoreIndicator`/`AiRecommendationCard`
primitives — but not by an actual screenshot with real score/
recommendation data. The bible's "five second" bar is met for
everything that mock mode can show (status, timeline, financials,
compliance) — the AI-generated portions inherit the same "not verified
against a live provider" caveat every AI feature in this codebase has
had since phase 03.

## Known limitations (intentional, for a future phase)

- **No fleet-wide rollup** — aggregating any of this across the whole
  fleet is phase 13's Command Center.
- **AI Insights recommendations aren't actionable yet** — same gap
  noted in `docs/vehicle-intelligence.md`; Accept/Dismiss render but
  don't persist.
- **The timeline reads most-recent-first**, not the bible's literal
  ascending life-story order — a deliberate consistency choice (see
  above), not an oversight.
- **The `vehicle_intelligence.summary` migration hasn't been applied to
  the live Supabase project** — same recurring situation as every
  table added since phase 03 (no Docker/Supabase CLI available
  locally). Verified instead via unit tests and a mock-mode browser
  pass.
