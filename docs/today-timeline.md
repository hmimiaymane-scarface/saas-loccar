# Today Operating Timeline

Productization wave 2 phase 12 — "show the owner the day as operations,
not rows." `components/domain/overview/today-timeline.tsx` (rendered on
`/overview`, Level 2) shows 5 kinds of event happening today, each a
real focusable marker opening the exact next useful step.

## The 5 entry types

`getTodayTimeline()` (`lib/data.ts`) returns `TodayTimelineEntry[]`
(`types/rental.ts`), each carrying its own `actionLabel`/`actionHref` —
no entry is ever a dead end or a link into the reservations table:

| Type | Source | Action |
|---|---|---|
| `pickup` | Reservations with `pickup_at` today | `/reservations/{id}/pickup` |
| `return` | Reservations with `return_at` today | `/reservations/{id}/return` |
| `extension` | `contract_amendments` of type `rental_extension` created today | `/contracts/{id}` |
| `payment_expected` | Reservations with `remaining_balance > 0` whose pickup or return is today | `/payments?reservationId={id}` |
| `maintenance_blocking` | Maintenance records currently in progress/waiting for parts, or scheduled to start today | `/maintenance/{id}` |

## Two deliberate, honest scope limits

**"Extension" reflects a contract amendment, not a reservation-date
change.** `contract_amendments` (built by the original roadmap's
contract-lifecycle phase) is an insert-only paper trail on the
generated contract document — creating a `rental_extension` amendment
does **not** update the reservation's own `pickup_at`/`return_at`. That
was a deliberate scope limit when amendments were built, not something
this phase changes. So an "Extension" card here means "an extension was
agreed and recorded in the contract today," not "this reservation's
schedule actually moved" — the fleet calendar and the reservation's own
dates are unaffected. Actually extending a live rental's real return
date has no workflow anywhere in this codebase; building one is a
separate, larger feature (availability re-check, pricing recalculation,
a real status-transition allowance for `active` reservations) that this
phase deliberately did not take on.

**"Payment expected" has no due-date concept behind it.** There is no
payment-schedule or due-date field anywhere in this schema — the
`remaining_balance` a reservation carries is a flat, dateless amount.
"Expected today" is derived, not stored: a reservation whose pickup or
return happens today is the natural moment to collect on any remaining
balance, so that's the signal used. A reservation with a balance due
but no pickup/return today never appears here (it's still covered by
the Home screen's "Needs You Now" outstanding-balance alert instead —
see `docs/needs-attention.md`).

## Maintenance-blocking window

Reuses `getFleetOverview`'s own "currently blocking" status pair
(`in_progress`, `waiting_for_parts`) for maintenance already underway
regardless of date, plus `planned`/`scheduled` records whose
`scheduled_on` is today — the same status vocabulary, just also
date-scoped for "starting today" cases `getFleetOverview` doesn't need
to distinguish.

## Known limitation

Mock mode has no contract/amendment fixtures (contracts have been a
live-Supabase-only feature since the original roadmap's phase 06), so
`extension` entries are always empty in mock mode — the same recurring
caveat every AI/database-only feature in this codebase carries.
