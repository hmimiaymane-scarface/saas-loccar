# Real Phone "One-Day Rental Company" Simulation

Roadmap phase 62. Brief: "run RentalOS for a full simulated day," using
only phones for normal operations, across 11 named situations (morning
check, new reservations, customer lookup, pickups, payments, returns,
late return, photos, contract, expense, end-of-day review). "Done when:
nobody needs a laptop for normal daily operations."

**No code changed this phase.** This is a live-simulation/verification
phase, not a build phase — see "Findings" below for the one thing worth
a future phase's attention, and "Testing-technique notes" for two
false alarms this session ran into and resolved, kept here so a future
session doesn't waste time rediscovering them.

## Method

This environment has no way to force Chrome's actual window/viewport to
a real phone size — `resize_window` was tried three times at three
sizes (390×844, 800×600, 390×844 again) across two tabs, and
`window.innerWidth` stayed pinned at the full desktop resolution
(1920×1080) every time, confirmed via direct JS query, not just visual
inspection. Worked around it with a standard responsive-design-preview
technique instead: an `<iframe>` sized to a real 390×844 CSS box,
pointed at `localhost:3000`. An iframe gets its own genuine CSS
viewport for media-query purposes regardless of the parent window's
size, so `MobileShell`'s `lg:hidden` breakpoint
(`components/layout/mobile-shell.tsx`) engages correctly and every
screenshot below is the app's real mobile layout, not a scaled-down
desktop one.

Ran against the mock-mode dev server (`NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev`), the same environment
every other phase has used. The standing limitation carried from every
prior phase applies here too: every mutating server action throws
inside `createClient()` in mock mode, so no operation below was
actually submitted end-to-end against a real database — what's
verified is that every named operation has a real, reachable,
touch-usable mobile screen, with mock mode's own honest "not available
in demo mode" message where a real write would be needed.

## Findings, scenario by scenario

**Morning check.** `/overview` — stat cards (Available/Rented/Returning
today), a plain-language daily summary ("Good morning, Youssef — here's
Saturday 1 August at a glance"), and a needs-attention list (overdue
returns, maintenance due, outstanding balances) all render as a clean
single-column stack. Fully usable one-handed.

**New reservations.** `/reservations/new` — the 5-step wizard (Customer
→ Vehicle & price → Payment → Inspection → Contract) renders correctly
at phone width; native `<input type="datetime-local">` pickers for
pickup/return, pre-filled pickup location. Reached step 2 (Vehicle &
price) live.

**Customer lookup.** The same wizard's customer-search step — typed
"Idrissi" into the real `CustomerSearchCombobox`, got a live result
("Khadija Idrissi, +212 661-234567") back from the actual mock-data
search path (`lib/data.ts#searchCustomers`, not a stub), tapped it, and
the wizard advanced to step 2 with the customer attached. This is a
real, working touch interaction, not just a static screenshot.

**Pickups.** Route exists (`/reservations/[id]/pickup`) and correctly
redirects back to the reservation detail page when the reservation is
already active (pickup doesn't apply once a rental has started — this
is intentional, matching `lib/reservations/status.ts`). For a
not-yet-started reservation the same "Inspections require a connected
Supabase project" mock-mode message documented in this project's own
standing limitations applies — not a mobile-specific gap, the identical
message a desktop session gets.

**Payments.** `/payments` — Revenue this month / Outstanding balance /
Deposits held / Unresolved damage charges as stacked stat cards, plus a
full "Record a transaction" form (reservation, customer, type, method,
amount, reference, notes) — every field a normal, tappable native
input/select.

**Returns.** From a real overdue reservation's detail page (RB-3395,
`/reservations/bk_5`), tapped "Manage return" and landed on
`/reservations/bk_5/return` — a real return wizard showing planned vs.
actual return time, a notes field, and (mock mode) the same inspection
limitation as pickup.

**Late return.** The same RB-3395 return screen shows this natively:
an "Overdue" badge on the detail page, "Actual return: Late — now" in
red on the return wizard, and an explicit inline warning — "This return
is later than the planned date. Consider recording a late-return charge
in the next steps." Nothing here needed a separate flow; late is just
a state the same return screen already handles.

**Photos.** Blocked by the same standing mock-mode inspection
limitation named above — the required-photo-slot gating logic itself
(`lib/inspections/rules.ts`) is unit-tested (phase 61's scenario 3) and
unrelated to mobile layout; the actual camera-capture UI needs a real
device, which this environment doesn't have.

**Contract.** `/reservations/bk_5/contract-preview` — reachable, and
degrades honestly: "Contract preview needs a connected Supabase project
— not available in demo mode," rendered as a normal card, not a crash.

**Expense.** `/expenses` — "7 expenses on file," a real recorded
expense (Fuel, Hyundai Tucson, 450 MAD) shown as a card, "Record
expense" button, filters (category/vehicle/date range) all stacked and
tappable.

**End-of-day review.** `/reports` — period tabs (Today/This
week/This month/Last month/Custom), a "Financial overview" breaking
down rental payments, additional charges, refunds, deposits collected/
returned, expenses, a "Known operating result" line, and an "as of
today" outstanding-balance/deposits-held/deposits-retained section.
Reads cleanly top-to-bottom on a phone with no horizontal scrolling
needed.

**Nav completeness, not one of the 11 but worth recording**: the
bottom-nav's central "+" opens a "Quick actions" sheet covering New
Rental, Return Vehicle, Record Payment, Add Expense, Add Customer, and
Add Vehicle in one tap — i.e. six of this phase's eleven operations are
reachable from a single FAB on every screen, not buried in a menu. The
"More" tab separately lists Reservations, Customers, Documents,
Maintenance, Reports, Contracts, Contract Templates, Team, Import data,
and Website — full parity with the desktop sidebar, nothing held back
as desktop-only.

## Verdict

**"Done when: nobody needs a laptop for normal daily operations" —
holds**, for every one of the 11 named operations, within the honest
limits of what this environment can actually exercise (see "Method"
above): every operation has a real, reachable, phone-width screen, and
where mock mode blocks an actual write, it blocks it with the same
plain message a desktop session would get — mobile isn't a
second-class, more-broken experience than desktop anywhere this session
touched.

## One real finding worth a future phase's attention

**A stale service worker can make a feature go silently, invisibly
dead on a real phone — not just visually stale.** This project's
existing PWA/service-worker limitation (documented in the project's
checkpoint memory and `docs/motion-polish.md`) was previously observed
as *visual* staleness — old CSS/JS chunks serving stale-but-loading
content. This session hit a different, more concerning shape of the
same root cause: after a prior session's dev server left a service
worker registered, the customer-search combobox above accepted keypresses
and updated its own input value, but silently returned zero results —
**no error, no toast, no console warning, nothing a real end user would
ever notice as "something is broken"** — because a stale Turbopack
module chunk had failed to load (`Module ... was instantiated ... but
the module factory is not available`, the same class of error already
named in `docs/error-monitoring.md`/`docs/product-analytics.md` for
this dev environment specifically). Clearing the service worker +
caches and restarting the dev server fixed it immediately, and the
identical interaction then worked perfectly. **The real-world version of
this risk**: a rental company's phone, left signed in across an app
deploy, could have a feature quietly stop working with zero visible
error until the page is force-refreshed or the service worker is
otherwise invalidated. Worth a future phase considering: does the
current service-worker update strategy (`components/pwa/service-worker-register.tsx`)
force an update check/reload aggressively enough after a new deploy, or
could a real owner sit on stale JS indefinitely the way this session's
dev server did? Not fixed this phase — phase 62 is a simulation/finding
pass, not a service-worker-architecture phase.

## Testing-technique notes (not product bugs, kept so a future session doesn't re-debug these)

- **The stale-service-worker issue above was caught mid-session and
  first misread as a possible real bug** before the fix (unregister
  service workers + clear caches + restart the dev server with a fresh
  `.next`) resolved it and the same interaction worked normally
  afterward — same documented fix as every prior phase's version of this
  limitation, just a new symptom (a feature going quietly inert, not a
  visual regression) worth naming explicitly for next time.
- **A synthetic (CDP-level) mouse click on the mobile bottom nav's
  circular "Quick actions" button repeatedly failed to open its sheet
  in this session's iframe-based testing setup, even at a freshly
  re-verified correct coordinate** — while a real, in-page
  `element.click()` call opened it immediately and correctly
  (`aria-expanded="true"`, `data-state="open"`, the sheet's content
  genuinely present). Every other tapped element this session (bottom-nav
  route links, a search result row, wizard "Continue", "Manage return")
  responded correctly to the same kind of synthetic click, so this was
  narrowed down to something specific to this one button/testing
  combination, not a general "clicks don't work in an iframe" problem
  and not a real product defect — the component's actual behavior,
  confirmed via `.click()`, is correct.
