# Remove Before Adding

Roadmap phase 65, sixteenth phase of Wave 8. Brief: "perform a final
complexity reduction." For every screen: does this help a rental owner
today? Is this repeated often? Does this need to be visible? Can it be
automatic? Can it live one level deeper? Can it be removed? "Done
when: RentalOS feels smaller than its actual capability."

## Scope and method

64 prior phases each added something individually well-justified —
this phase's job is to look at the accumulated *result*, not any one
phase's own reasoning. "Every screen" literally would mean auditing
several dozen routes; that's not proportionate to one phase, so this
pass concentrated on the highest-leverage surfaces instead: the
top-level navigation (what a rental owner sees on every single visit)
and the Overview/Home page (what a rental owner sees on every single
*day*) — the two places where reduced visible complexity compounds the
most. Entity detail pages (a single vehicle's or customer's full
record) were surveyed and found dense too, but a detail page a user
visits with a specific question in mind is a different kind of screen
than an ambient daily dashboard — see "Considered, deferred" below for
why that wasn't touched this pass.

**No capability was removed anywhere in this phase.** Every change
below is a visibility/default change (collapsed, moved one level
deeper, or reachable via a link instead of a duplicated nav entry) —
nothing was deleted, no route was removed, no data stopped being
computed.

## What changed

### 1. Contract Templates folded into Contracts (nav: 14 → 13 `moreLinks` items)

**The six questions, answered**: does an owner need "Contract
Templates" visible as its own top-level destination? Templates are set
up once (or rarely revisited) per contract type — a fundamentally
different frequency than *viewing/searching generated contracts*,
which happens continuously as the business runs. Can it live one level
deeper? Yes — nothing about template management needs top-level
billing.

**What shipped**: `/contract-templates` still exists, unchanged, but
is no longer a `moreLinks` entry (`lib/navigation.ts`). Reachable
instead via a "Manage templates" button in `/contracts`' own header
(`app/(dashboard)/contracts/page.tsx`), with a matching "← Contracts"
back-link added to `/contract-templates` itself
(`app/(dashboard)/contract-templates/page.tsx`) so the two pages read
as one connected pair, not a dead end. `moreLinks`' own "Contracts"
description now says "...Manage templates from here too" so the
capability doesn't just quietly move — it's discoverable from the one
remaining entry point.

### 2. Overview page: Business Health + Historical Analysis collapsed by default

**The six questions, answered**: `app/(dashboard)/overview/page.tsx`
(bible Chapter 10 §2's 5-level hierarchy, phase 13) rendered every
tier unconditionally on every load. Tiers 1-2 (Needs Attention,
Today's Operations — stat cards, timeline, fleet grid) are genuinely
daily-use: an owner checks these every single morning, so "is this
repeated often" and "does this need to be visible" both answer yes,
unconditionally. Tiers 3 and 5 (Business Health: pulse grid, revenue
intelligence, fleet/customer health, performance highlights;
Historical Analysis: financial summary, activity feed) are
retrospective/analytical — real, useful, but not something a
day-to-day operator needs competing for scroll space against "which
customer do I need to call today." Tier 4 (Opportunities) was already
correctly conditional (renders nothing when there's nothing to
surface) and stayed untouched.

**What shipped**: a new `InsightsToggle` client component
(`components/domain/overview/insights-toggle.tsx`), wrapping the
`components/ui/collapsible.tsx` primitive this codebase already had
(built for `member-row.tsx`'s access-panel disclosure, reused here
rather than inventing a second pattern) behind a single "Show/Hide
business health & history" button, closed by default. Every card
underneath — `BusinessPulseGrid`, `RevenueIntelligenceCard`,
`HealthOverviewCard` ×2, `PerformanceHighlightsCard`,
`FinancialSummaryCard`, `ActivityFeedCard` — is the exact same
component with the exact same props as before; none of their own logic
changed. One tap reveals all of it, in place, no page navigation.

**Real bug found and fixed in the same change, not a pre-existing
one**: the toggle's initial label render (`{open ? "Hide" : "Show"} business
health &amp; history`) rendered as "Showbusiness health & history" — no
space — live in the browser, despite the source clearly having one.
Root cause: `Button`'s `inline-flex gap-1.5` layout treats each
top-level JSX child as its own flex item; a ternary expression and the
following text were two separate children, and the browser's
whitespace-collapsing rules trim the *leading* space of the second
text node when it becomes its own anonymous flex item — the space
never reaches the rendered DOM. Fixed by moving the whole label into
one ternary producing a single string
(`{open ? "Hide business health & history" : "Show business health & history"}`),
so there's only one text child, hence one text node, hence nothing to
trim. Confirmed via `grep` that no other button in this codebase uses
the `{ternary} literal-text` two-children shape that triggers this, so
it isn't a wider latent issue to hunt down separately.

## Considered, deferred (found, not changed — a judgment call, not a bug)

- **Vehicle detail page (`app/(dashboard)/fleet/[id]/page.tsx`, 422
  lines) and customer detail page (294 lines)** are similarly dense —
  status, intelligence card, timeline, current/upcoming/recent
  reservations, inspections, maintenance, insights, economics,
  documents, all on one page. Unlike Overview, a detail page is visited
  *with a specific question in mind* ("what's this car's maintenance
  history," "has this customer paid"), not ambiently checked every
  day — the same collapsed-by-default treatment applied to Overview is
  a real option here too, but is a separate, deliberate decision this
  pass didn't make unilaterally across two more pages built by several
  earlier, individually-deliberate phases. Worth a dedicated look if a
  future phase wants to push further.
- **`Reservations`/`Customers` appearing in both `primaryNav` and
  `moreLinks`** — already a documented, deliberate trade-off (see
  `lib/navigation.ts`'s own comment): mobile's bottom nav has no room
  for them outside `/more`, so they're listed there for mobile even
  though desktop already shows them in the sidebar. Not a new problem
  this phase found; re-confirmed as still the right call, not touched.
- **`CompanySettingsForm`'s 8 fields on one page** — reviewed, judged
  proportionate for a single settings page (not excessive density by
  the standard of any comparable SaaS settings screen); no change
  needed.

## Verification

tsc/eslint/795 tests (unchanged — no new logic to unit-test; both
changes are structural/visibility only)/build all clean. Live-verified
in mock mode: `/contracts` shows the new "Manage templates" button and
navigates correctly to `/contract-templates`, which shows the new
"← Contracts" back-link; `/more` no longer lists "Contract Templates"
as its own row and the "Contracts" row's description reflects the
merge; `/overview`'s toggle renders "Show business health & history"
(space intact, post-fix), and clicking it reveals all seven
previously-always-visible cards correctly, with the label flipping to
"Hide business health & history" and the chevron rotating.

One repeat of this session's now-familiar stale-service-worker/
Turbopack-chunk false alarm during this exact verification pass — the
toggle appeared completely unresponsive to clicks (real DOM `.click()`
included) until service workers were unregistered, caches cleared, and
the dev server restarted with a fresh `.next`; the identical click then
worked correctly on the first try. Not a defect in this phase's code —
see `docs/one-day-phone-simulation.md`'s "Testing-technique notes" for
the earlier instances of this same environment quirk.
