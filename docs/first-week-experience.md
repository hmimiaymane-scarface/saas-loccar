# Empty-State and First-Week Experience

Roadmap phase 53, third phase of Wave 8 ("Polish, Observability,
Security, and Launch Confidence"). Brief: "Make a new account feel
alive before it has lots of data" — no vehicles → add first vehicle,
no rentals today → show upcoming/available fleet, no customers →
start first rental, no analytics → explain what will appear after
activity. "Done when: new accounts never look broken or unfinished."

A prior phase (51, UI Consistency Audit) had already confirmed every
built list page reuses `EmptyPlaceholder` consistently — this phase's
own audit (a dedicated research pass across every page a brand-new
owner lands on, right after finishing the onboarding wizard) found
the real gaps were one level deeper: whether those empty states are
*actionable* and *honest*, not just present, and whether the flagship
Overview dashboard specifically looks broken with zero data.

## Two real bugs, not just missing copy

**Business Pulse's Fleet Status read "Critical" (red) for a company
with zero vehicles.** `scoreBand(0)` can't tell "a real vehicle scored
the worst possible score" apart from "no vehicles exist to score" —
both average to 0. `computeFleetPulse` (`lib/business-pulse.ts`) now
takes a `vehicleCount` and returns a neutral "No vehicles yet" instead
of running the real score through `scoreBand` when it's zero. Notably,
the sibling `HealthOverviewCard` on the same page already guarded this
exact case (`entityCount === 0` → render nothing) — this was an
inconsistency between two adjacent widgets, not a deliberate choice.

**`computeRevenueIntelligence` claimed "Revenue is holding steady
compared to last period" for a company with literally zero revenue,
ever.** A fabricated claim of stability, not an honest absence of
data. Its own sibling function, `computeRevenuePulseHeadline` (the
mobile home screen's version, added in an earlier phase), already
guards this exact case and returns `null` — its own doc comment says
so explicitly. `computeRevenueIntelligence` had no equivalent guard, a
genuine drift between two functions whose doc comments say they
should never disagree. Added a `hasData: boolean` field; when both
periods are exactly zero, it now returns an honest "Not enough revenue
history yet" headline with no drivers, instead of a "steady" claim.

Both bugs are the literal first things a brand-new owner sees on
Overview, immediately after finishing `OnboardingWizard` (which
redirects straight to `/overview`).

## EmptyPlaceholder gained an action slot

Before this phase, `EmptyPlaceholder` (`components/domain/empty-placeholder.tsx`)
only took `icon`/`title`/`description` — any real CTA had to live
outside the component (usually the page's own header), identical
whether a list was genuinely empty or just filtered down to nothing.
Added an optional `action: {label, href}` prop, rendered as a real
button. This is what makes the rest of this phase's fixes possible
without inventing a second, heavier pattern per page.

## Filtered-to-zero vs. genuinely-zero

Fleet, Reservations, and Customers list pages previously showed the
exact same "no results" copy whether the account had zero of that
resource ever, or 40 of them that just didn't match the current
filter/search. Each page now checks whether any filter/search param is
active and branches:

- **Fleet**, no filters, zero vehicles → "Add your first vehicle" +
  action to `/fleet/new` (role-gated, matching the header's own button).
- **Reservations**, no filters, zero reservations → "Create your first
  reservation" + action to `/reservations/new`.
- **Customers**, no search, zero customers → "Start your first rental"
  + action to `/reservations/new` — **not** "Add customer." This
  matches the brief's own named example and the page's existing
  explanatory copy ("customers are added automatically the first time
  you create a reservation for them"), which the page's header button
  previously contradicted by nudging toward manual entry instead.
- **Payments** was deliberately left unchanged: its existing empty-state
  copy already explains what will appear and when, and the
  record-payment form for eligible roles sits directly above it on the
  same page — a duplicate CTA in the empty state would be redundant,
  not helpful.

## Other fixes

- **`ActivityFeedCard`** had no empty-state branch at all — a
  brand-new account's Overview rendered a visible "Recent activity"
  header over a completely blank list. Added an `InlineEmpty` message.
- **`FleetVisualGrid`**'s zero-vehicle state was text-only ("add your
  first vehicle to see it here") with no actual link. Added a real
  "Add vehicle" button.
- **`NeedsAttentionSection`**'s empty state said "Everything that
  matters today is already handled" unconditionally — misleading for
  a brand-new account, since nothing has actually been handled, there's
  simply nothing yet. Added an `isNewAccount` flag (`metrics.fleetTotal
  === 0`, already fetched on the Overview page regardless of mock/live
  mode) that swaps in an honest "You're all set up" message with a
  direct Add-vehicle CTA; the original copy stays for the genuine
  "caught up on real work" case.
- **Calendar's `FleetTimeline`** (desktop) and **`VehicleMode`**
  (mobile) both rendered a near-blank grid — just a day-label header
  row, no body — for zero vehicles. Both now render an
  `EmptyPlaceholder` with an Add-vehicle CTA instead.
- **Reports' two chart cards** ("Revenue by vehicle", "Expenses by
  category") used to disappear entirely with zero data, leaving two
  unexplained gaps in the grid. Both cards now always render; with no
  data they explain what will fill the chart in, rather than vanishing
  silently.

## Deliberately not changed

- **`HealthOverviewCard`** (×2, fleet + customer intelligence) still
  return `null`/render nothing when `entityCount === 0`, leaving a
  blank gap in the `grid lg:grid-cols-2` next to Revenue Intelligence.
  This is a minor layout cosmetic, not a "looks broken" failure on the
  scale of the two bugs fixed above — hiding a widget cleanly reads
  differently from a red "Critical" label or a fabricated claim. Left
  as-is rather than reworking the grid's column-span logic for a
  one-off gap.
- **Mobile home's `MissionFeedList`** empty copy ("Nothing needs you
  right now" / "New work will show up here as it comes in.") is
  already honest and non-misleading, unlike the desktop equivalent
  this phase fixed — it just doesn't link directly to `/fleet/new`.
  Left alone since it isn't actively wrong, only slightly less
  actionable; revisit if a future phase specifically targets mobile
  home polish.
- **Reports' other cards** (`FinancialReportCard`, `FleetPerformanceTable`,
  `ReservationPerformanceCard`, `CustomerOverviewCard`,
  `PaymentsSummaryCards`) already render plain zero/0%/0 MAD rows with
  no visual brokenness (confirmed zero-guarded by existing unit tests)
  — no change needed.

## Verification

tsc/eslint/757 tests (2 new, covering both bug fixes)/build clean at
every checkpoint. Live mock-mode browser check confirmed the affected
pages render correctly with the mock fixture's existing (non-zero)
data — mock mode's fixtures aren't actually empty, so the true
zero-data paths (a real brand-new company with zero vehicles/
customers/revenue) could only be verified by reading the render logic
directly, the same limitation every phase touching `/platform` or
real-mutation paths has hit before. The component-level render paths
themselves (which branch on `.length === 0`/`entityCount === 0`
regardless of mock vs. live data) were traced by hand against the
audit's own findings.
