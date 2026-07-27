# Vehicle Selection Experience

Productization wave 3 phase 23 — "make choosing a car fast and safe...
selecting an impossible vehicle becomes difficult."

## What already existed before this phase

`ReservationForm`'s Vehicle card already showed rate and category per
candidate (`{plate} · {category} · {rate}/day`) and already filtered
by category — two of the six "show" items were already done, verified
by reading the code rather than assumed.

## The real gap this phase closed

`fetchAvailableVehicles` -> `lib/data.ts#getAvailableVehicles` fetched
every company vehicle, filtered out anything under maintenance or
conflicted with an overlapping reservation, and returned *only* what
survived. A conflicted or maintenance-blocked vehicle wasn't shown
disabled with a reason — it was silently absent from the list
entirely. An owner had no way to see "the Dacia Duster is actually in
maintenance right now" or "that Hyundai Tucson is booked until the
22nd" from this screen without going to check the Fleet page
separately.

## What was built

**Pure functions**, `lib/availability.ts` (alongside the existing
`isVehicleAvailable`):
- `findConflictingReservation` — the specific reservation blocking a
  vehicle for a requested window (for "booked until {date}" detail —
  no customer name shown, unnecessary for "why can't I pick this").
- `findNextReservationAfter` — the closest upcoming reservation on a
  vehicle starting at/after a given date — the data behind "next
  booking warning if close to return date."
- `TIGHT_TURNAROUND_HOURS` (24h) — a named, first-pass threshold for
  what counts as "close," not inlined.

**New DB-touching function**, `lib/data.ts#getVehicleSelectionOptions`
— every category-filtered vehicle (not just the available subset),
each tagged `available` / `conflict` / `maintenance` / `unavailable`,
with a `conflictUntil` date or a `nextBookingWarning` attached as
appropriate. Deliberately additive, not a change to
`getAvailableVehicles` itself — `lib/ai/tools.ts`'s AI Assistant tool
calls that function directly expecting a plain `Vehicle[]` for a chat
response, an unrelated consumer this phase had no reason to touch.
Factored the shared "what's actually blocking" reservation fetch (used
identically by both functions) into a private
`getBlockingReservations` helper rather than duplicating it.

**`ReservationForm` Vehicle card**: available vehicles render exactly
as before (same selectable grid), now also showing a next-booking
warning badge when relevant. A new "Not available for these dates"
section below lists every blocked vehicle, disabled (no click
handler, muted styling, `aria-disabled`), each with its reason —
the concrete, literal answer to "selecting an impossible vehicle
becomes difficult": now a visible, disabled state instead of just
silent omission.

## Real verification, with actual mock data

Unlike phase 22 (blocked by this environment having no AI provider
key), this phase's data doesn't depend on any AI/DB write — a full
live mock-mode pass was achievable and done:

- Requesting an SUV window (07/29–07/31/2026) correctly showed two
  real mock `maintenance`-status Dacia Dusters under "Not available
  for these dates" labeled "In maintenance," and a Dacia Sandero
  labeled "Unavailable" (a distinct static `unavailable` status).
- Shortening the window to end ~15 hours before a real mock booking's
  start (the Hyundai Tucson, booked 07/17–07/22) correctly showed the
  Tucson in the *available* list with "Next booking 17 Jul — tight
  turnaround."
- Zero console errors in both scenarios.

(One transient issue during this pass, not a code bug: after
restarting the dev server, a fresh tab briefly served a stale client
JS bundle showing "No vehicles available" for every query — the same
recurring Turbopack-dev-cache-needs-a-hard-reload pattern this session
has hit before, documented in `AGENTS.md`; a hard reload resolved it
immediately and the feature worked correctly afterward.)
