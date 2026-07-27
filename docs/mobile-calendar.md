# Mobile Calendar

Productization wave 2 phase 17 — "make availability obvious on a
phone... the calendar works comfortably one-handed." Replaces the old
flat 7-day `DayAgenda` (deleted) with
`components/domain/calendar/mobile-calendar.tsx`, rendered at `lg:hidden`
alongside desktop's unchanged `FleetTimeline` (`lg:block`) — both still
read from the exact same server-fetched data
(`getCalendarReservations`/`getCalendarMaintenanceBlocks`/`getVehicles`),
no new queries.

**Scope**: mobile only, matching the brief's own title. Desktop's
`FleetTimeline` grid was untouched — it already worked.

## The 3 modes

A segmented control (3 buttons, 44px tall) switches between:

- **Today** — today's own pickups/returns/maintenance rows only.
- **Week** — the old 7-day list, kept, but every row now opens a quick
  summary first (see below) instead of jumping straight to the full
  reservation page, and every empty day gets a real "Book a rental"
  button instead of just showing "Nothing scheduled."
- **Availability** (the brief's "Vehicle" mode) — new. One row per
  vehicle, a 7-segment day strip color-coded available/booked/overdue/
  maintenance. Every segment is a real tap target.

## Three things that didn't exist anywhere in this app before this phase

1. **Swipe navigation.** No touch-gesture code existed in this
   repository at all before this phase. `useSwipeNavigation` (a small
   local hook inside `mobile-calendar.tsx`, not a new shared library —
   it has exactly one real caller shape, used by both Week and
   Availability modes) reads `touchstart`/`touchend` delta-x against a
   60px threshold and shifts the visible week's `?week=` param, the
   same URL convention `CalendarNav`'s existing prev/next buttons
   already use.
2. **Tap an empty slot → start a real booking.** `/reservations/new`
   already fully supported `?vehicleId=`/`?pickup=` (from earlier
   phases) — it just had nothing linking to it from an empty calendar
   cell on mobile before now. Week mode's empty days and Availability
   mode's empty vehicle-day segments both link there directly.
3. **Tap a reservation → a quick summary, not the full page.** Reuses
   the exact `Popover`-on-tap pattern `FleetVisualGrid`/`TodayTimeline`
   already established elsewhere in this app (Overview page) — a small
   card with customer/vehicle/dates/status and one "View reservation"
   button, rather than committing straight to `/reservations/[id]`.
   Maintenance blocks get the same treatment, linking to
   `/maintenance/{id}` — previously they were inert `<div>`s with only
   a hover tooltip, no tap target at all.

## Known limitation

The Availability mode's day segments are sized ~40-48px wide (7 must
fit across a phone's width) rather than the full 44px touch-target
minimum on the horizontal axis — height is kept at 44px, width is a
deliberate trade-off every real calendar app with a multi-day-per-row
view makes for the same reason.
