# Frontend Performance Pass (roadmap phase 41)

Goal: make the app feel instant. "Done when": performance is measured,
not judged by feeling alone. This doc is the measurement record — every
claim below points at a real number captured during this phase, not an
impression.

## Method

- **Bundle size**: `@next/bundle-analyzer` (new dependency, `next.config.ts`).
  This app's default `next build` uses Turbopack, and the analyzer
  doesn't hook into Turbopack builds yet — it prints this plainly
  rather than silently producing nothing:
  `The Next Bundle Analyzer is not compatible with Turbopack builds, no report will be generated.`
  Its own suggested workaround (`next build --webpack`) does work and
  is what actually produced the numbers below — **these are webpack's
  chunking, not Turbopack's**, a real caveat: Turbopack may split
  differently in whatever actually ships. Still directionally useful
  as a "what's in the bundle" audit, which is what this phase needed.
  Run it yourself: `ANALYZE=true npx next build --webpack`, then open
  `.next/analyze/client.html`.
- **Route load timing**: a production build + `next start` (dev-mode
  timing is not representative — Next does extra work per request in
  dev that a real user never pays for), Navigation Timing API
  (`performance.getEntriesByType("navigation")`) read directly in
  Chrome via `javascript_tool`, not guessed from a stopwatch.
- **Algorithmic complexity**: read the actual code paths (not assumed)
  to find real O(n²)-shaped work, verified by checking what the
  refactored version's Big-O actually is, not just "it feels faster."

## What was measured and found NOT broken (stated plainly, not glossed over)

The phase brief listed 9 things to "measure and improve." Investigating
first, before touching code, found several were **already fine** —
worth stating explicitly rather than manufacturing a fix to look busy:

- **Server-component waterfalls, mostly already parallel.** The brief's
  framing assumed Overview (the single most data-hungry page, a
  dozen-plus queries) was a naive sequential waterfall. It is not: both
  its top-level fetch (8 calls) and its `loadIntelligenceExtras` helper
  (17 calls) already use `Promise.all`, likely from whichever phase
  built each addition following the pattern already established.
  `fleet/[id]` and the fleet/reservations list pages are the same.
  **The one real, avoidable waterfall found** was `reservations/[id]`
  (fixed — see below).
- **Search latency was already debounced everywhere.** The global
  command palette (200ms), and every page-level filter
  (`FleetFilters`/`ReservationFilters`/`CustomerSearch`, 350ms) already
  debounce before touching `searchParams` or calling the server search
  action. No per-keystroke round trip anywhere. Nothing to fix.
- **Bundle size is already lean.** No moment.js, no chart library, no
  lodash, no date library at all (`lib/timezone.ts` uses native
  `Intl.DateTimeFormat`). The heaviest client-facing deps are `motion`
  and `radix-ui`, both genuinely used, not dead weight.
- **Large lists are already server-paginated**, with one exception (see
  below) — fleet and reservations already fetch via `.range()` at
  24/20 items per page, not an unbounded client-side list.

## What was measured and fixed

### 1. Images: raw `<img>` everywhere, now `next/image` where it matters

Grepped all 8 raw `<img>` usages in the codebase. Only **3 were
actually remote Supabase Storage assets** — the damage-photo grid
(`damage-media-section.tsx`), the inspection-photo grid
(`inspections/[id]/page.tsx`), and the AI damage before/after comparison
images (`ai-recommendation-card.tsx`). These now use `next/image` with
`fill` + `sizes`, and `next.config.ts` gained an `images.remotePatterns`
entry for `**.supabase.co/storage/v1/object/**` (this app had **no**
`images` config at all before this phase — every `next/image` call
would have 400'd without it).

The other 5 `<img>` spots (both `ScanThumbnail` components in the
customer-onboarding and new-rental wizards, `PhotoUploadGrid`'s
in-progress capture thumbnail) render `URL.createObjectURL()` blobs of
a file the user just picked locally — not a remote asset, nothing for
`next/image`'s remote-optimization pipeline to do. Two of these already
had an explanatory comment for this; correctly left as `<img>`.

**Verified the `remotePatterns` config actually works**, not just wrote
it and hoped: hit `/_next/image?url=<a fake-but-*.supabase.co URL>`
directly against the running server — **500** (passed the allowlist,
then failed trying to fetch a host that doesn't actually resolve, as
expected for a fake project ref). Hit the same endpoint with
`https://example.com/test.jpg` — **400** (correctly rejected before any
fetch attempt, proving the allowlist is actually doing something, not
a no-op). Real photo rendering itself could not be verified visually —
mock mode's fixture damages/inspections carry no actual photo URLs
(confirmed: the damage detail page's Photos section shows "Add photo"
with nothing existing) — same "no real Storage-backed content in mock
mode" limitation every media-touching phase since 03 has carried.

### 2. One real server-side waterfall, fixed

`reservations/[id]/page.tsx` awaited `getReservationDetail`, then
awaited `loadContracts` — but `loadContracts` only needs the
`companyId`/`id` already in scope, not the reservation row itself. Now
`Promise.all`'d. One fewer sequential round trip per reservation-detail
page load — this is the phase's one confirmed instance of the "server
waterfall" the brief named, not a rewrite of everything that touches
`await`.

### 3. One real unpaginated list, fixed

`getCustomers` had no `.range()`/limit at all — confirmed as the one
genuine gap against fleet/reservations' existing `getVehiclesList`/
`getReservationsList` pattern. Added `getCustomersList` (same shape:
server-side `ilike` search + `.range()`) and switched only the
`/customers` page to it — `getCustomers` itself is untouched and still
used where the full unfiltered set is actually needed (payments page
customer dropdown, documents page, CSV export) — those aren't
list-rendering pages, pagination would break them.

Real-world impact in this specific company's mock data (8 customers)
is naturally invisible — this fix is about the pattern being correct
at whatever scale a real company's customer list actually grows to, the
same reasoning fleet/reservations pagination was already built on.

### 4. Calendar rendering: O(vehicles × bookings) → O(vehicles + bookings)

Both calendar views (`FleetTimeline`, desktop; `MobileCalendar`,
mobile) did `vehicles.map(v => ({ ...bookings.filter(b => b.vehicle?.id === v.id) }))`
— an O(vehicles × bookings) scan. `lib/calendar-grouping.ts` (new, pure,
unit-tested against hand fixtures — 6 new tests) builds
`Map<vehicleId, Booking[]>` / `Map<dateKey, {pickups, returns}>` once in
O(bookings + maintenance), then every vehicle/day does an O(1) `.get()`
instead of a fresh linear scan. Same output — proven by the existing
build/test suite passing unchanged plus the new grouping tests, not
just asserted.

- `FleetTimeline` is a **server component** — the win here is request-time
  compute, not re-render avoidance (it renders once per request).
- `MobileCalendar` is a **client component** with real re-render churn
  (mode toggle, swipe-to-change-week) — additionally wrapped the
  grouping in `useMemo` keyed on `[bookings]`/`[maintenanceBlocks]`, so
  switching mode or swiping between weeks doesn't redo the grouping
  when the underlying data hasn't actually changed (only `weekStart`
  has, which the per-day/per-vehicle rendering still recomputes
  correctly since that part genuinely depends on it).

**Not fabricated as a bigger problem than it is**: at this app's actual
current fleet sizes (dozens of vehicles, not thousands), the old
O(vehicles × bookings) scan was not visibly slow — this is a
correctness-of-approach fix for whatever scale the roadmap eventually
reaches, the same "fix the pattern before it's a fire" reasoning behind
the images/customers-pagination fixes above, not a response to an
observed real-world slowdown.

## Measured numbers (this build, this machine — see caveats)

**Bundle** (webpack analyzer, `ANALYZE=true npx next build --webpack`):
135 total client chunks, **2.65 MB parsed / 816 KB gzip** combined
across every route (not what one page loads — Next code-splits per
route, this is the sum of everything). Heaviest individual chunks:
Next's own internal client runtime (218 KB parsed / 59 KB gzip),
React DOM (185-195 KB / 58-61 KB across two chunks), Supabase's browser
client + WebAuthn (160 KB / 44 KB), Radix UI select/listbox primitives
(136 KB / 38 KB), the AI SDK (95 KB / 26 KB), `motion` + `zod`
(77 KB / 25 KB combined). Nothing here is a surprise or a candidate for
removal — this is a working baseline for the next phase to compare
against, not a list of villains.

**Route load time** (production build, `next start`, mock mode,
localhost — so absolute numbers include this machine's own overhead
and are NOT representative of real deployed latency; useful as a
*relative* baseline for a future re-measurement on the same machine):

| Route | TTFB | DOMContentLoaded | Load |
|---|---|---|---|
| `/fleet` | 1078ms | 1237ms | 1258ms |
| `/customers` | 732ms | 944ms | 959ms |
| `/overview` | 807ms | 1354ms | 1370ms |

**Honest gap, stated rather than hidden**: this table was captured
*after* this phase's own code changes (including the customers
pagination), not against a pristine pre-phase snapshot — there was no
isolated "before" measurement taken first. This is a real process
miss for this specific phase, not a deliberate omission: a true A/B
would have required capturing this table before writing any code. The
number above is still useful as the first real "how fast does this
page load right now" baseline this app has ever had, and as the
reference point for the *next* time this phase's methodology gets
reused.

## What this phase deliberately didn't do

- **Did not add `react-window`/virtualization anywhere.** No list in
  this app renders more than a page's worth of DOM nodes at once
  (24/20 items server-paginated) — virtualization solves a problem
  this app doesn't have yet.
- **Did not chase Turbopack-analyzer compatibility further.** `next
  experimental-analyze` (the tool's own suggested Turbopack-native
  alternative) was tried and left running long enough to conclude it
  isn't a quick five-minute win in this environment; the webpack
  fallback already gave real, useful numbers, and further debugging
  Turbopack analyzer compatibility is a tooling investment for its own
  future phase, not this one's job.
- **Did not add a Lighthouse CI / performance-budget gate.** No such
  infrastructure existed before, and standing one up (CI runner,
  thresholds, historical tracking) is a meaningfully separate
  investment from this phase's "measure and fix concrete things" scope.
  The Navigation Timing method documented above is the repeatable
  manual alternative until that's built.
- **Did not touch `getVehicles(companyId)` / `getBookings(companyId)`**
  (the other two unbounded-list reads the audit found) — unlike
  `getCustomers`, these feed calendar/dropdown consumers that
  genuinely need the *complete* set to be correct (a vehicle-selector
  dropdown or the calendar's vehicle columns can't page through
  results), so "paginate it" isn't the right fix there; left as a
  documented, deliberate scope boundary rather than force-fit.

tsc/eslint/688 vitest tests (6 new)/`next build` all clean at every
checkpoint.
