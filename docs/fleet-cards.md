# Fleet Cards

Productization wave 2 phase 15 — "turn the fleet into a quick visual
control surface... owners can scan the fleet in seconds." `/fleet`
already rendered a responsive card grid before this phase
(`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) — the gap
was card *content*, not layout mechanics, so this phase only touched
`components/domain/fleet/vehicle-card.tsx` and the query behind it.

## What's on the card now

Exactly six things, matching the brief's own "show only" instruction —
category, daily rate, and mileage were removed from the card face
entirely (they're one tap away on `/fleet/[id]`, same place the
advanced intelligence scores already live — that separation was
already correct before this phase and didn't need to change):

1. Vehicle (make + model)
2. Plate
3. Status badge
4. Current or next reservation, one sentence (`{customerName} — back
   {date}` when rented, `Next: {customerName}, {date}` when reserved)
5. Today's availability (`Available today` / `Not available today`)
6. An outstanding issue, if any (open damage count, or the blocking
   maintenance type)

## The data: `lib/data.ts#getFleetCardContext`

Scoped to whatever page of `getVehiclesList()` is on screen — not the
whole fleet, unlike `getFleetOverview` (the Overview page's dashboard
widget, a separate function, untouched by this phase). Kept separate
from `getVehiclesList` itself deliberately, since that function is also
used by the fleet CSV export route, which has no reason to carry this
join.

- **Current/next reservation** mirrors the `currentReservation`/
  `upcomingReservations` pairing `VehicleDetail` already has for a
  single vehicle — generalized to a list rather than invented fresh.
- **Today's availability** is derived, not stored: no vehicle is
  "available today" if it has an active reservation, a pending/
  confirmed reservation picking up today, or blocking maintenance. This
  is a genuinely new concept — no per-vehicle "free today?" field
  existed anywhere in this schema before.
- **Outstanding issue** reuses the exact "open damage" filter
  (`!["repaired","closed"].includes(status)`) already used identically
  in three other places in `lib/data.ts`, and the same
  `MAINTENANCE_BLOCKING_STATUSES` (`in_progress`/`waiting_for_parts`)
  `getFleetOverview` and `getTodayTimeline` already use. Maintenance
  takes priority over damage when a vehicle has both — one line, not a
  stacked list, matching "show only what matters immediately."

## Known limitation

Same recurring caveat as every mock-mode-anchored feature in this
codebase: mock fixtures are pinned to a fixed date (2026-07-18), so the
mock branch checks "is next reservation's pickup that fixed date,"
not the real server clock — `todayRange()`'s real-clock output is only
used in live mode.
