# Rental Start Reward Moment

Productization wave 3 phase 27 — "give clear closure and confidence...
the owner knows the rental is truly active and what comes next."

## What already existed before this phase

Every individual fact the brief asks for was already on the reservation
detail page somewhere — vehicle, customer, return date, paid/remaining
all appear in the existing Rental and Pricing cards. What didn't exist
was any acknowledgment that something had *just happened*, or any
explicit statement of what to do next — activating a rental
(`PickupWizard`'s `activate()`) silently redirected straight to the
same ambient detail page an owner would see at any other time, with no
distinction between "I'm just checking on this" and "I just finished
handing over the keys."

## What was built

**`RentalStartedBanner`** (new, pure) — a distinct, emerald-toned card
shown at the very top of the reservation page: "Rental started" plus
the six required facts (vehicle, customer, return date/time, paid /
remaining) and one computed "Next" line:

1. If a balance remains → "Collect the remaining {amount}."
2. Else if no contract has been generated yet → "Generate the rental
   contract." (ties directly into phase 26's readiness work)
3. Else → "Nothing else needed until the return on {date}."

No new route, no toast library (this app has never used one — every
confirmation state elsewhere is inline UI, not a transient notification,
and this follows that same idiom). The banner is gated by a
`justActivated=1` query parameter `PickupWizard` appends to its
post-activation redirect, so it appears exactly once, right when it's
earned, without needing a dismiss control or any new persisted state —
navigating away (or simply not arriving via that link) means it never
appears.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run test` (591 tests, no new
ones — this is pure presentational wiring, nothing new to unit-test
beyond what the existing reservation/payment types already guarantee),
and `npm run build` were clean.

**Real, full mock-mode browser verification — unlike every phase since
24, this one didn't hit the Supabase mutation wall**: the banner reads
only data the reservation page already loads, so it needed no
DB write to render. Navigated directly to
`/reservations/bk_1?justActivated=1` (a real active mock reservation)
and confirmed the banner renders correctly in both light and dark mode:
vehicle, customer, return date, and paid/remaining all correct, and the
"Next" line correctly computed "Collect the remaining 320 MAD" (bk_1
has a real partial balance in mock data). Zero console errors in both
themes. The other two "Next" branches (contract-not-generated,
nothing-left) are simple string-literal ternary arms with no additional
rendering complexity — not independently re-verified live, given the
first branch already proved the whole data-flow and formatting path
correct.
