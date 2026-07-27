# Smart Defaults and Memory

Productization wave 3 phase 20 — "reduce typing... repeated rentals
require dramatically less manual input than first-time rentals."

## What already existed before this phase

Four of the brief's seven examples were already true, verified by
reading the code rather than assumed:

- **Pre-fill returning customer information** — the `?customerId=`
  fast path (roadmap phase 09) and `NewRentalWizard`'s own in-wizard
  search (wave 3 phase 19) both skip straight past the Customer step.
- **Pre-fill preferred vehicle category** — `defaultCategory` already
  comes from the customer's CLV `preferredCategory` (phase 09).
- **Suggest vehicle's normal price** — `reservation-form.tsx#onSelectVehicle`
  already sets the daily rate to that vehicle's own `dailyRateMad` the
  moment it's picked.
- **Reuse company contract defaults** — `resolveContractInputs`
  already auto-selects the company's one active contract template when
  no explicit template id is given (which `NewRentalWizard` never
  passes); it only asks for an explicit choice if 0 or 2+ templates are
  active, a reasonable existing safeguard, not friction.

No code changes were made for these four.

## What this phase actually built

New pure module, `lib/reservations/smart-defaults.ts` — mode-finding
helpers with zero Supabase dependency (`mostCommonString`,
`mostCommonAmount`, `mostCommonHour`), hand-fixture tested.

New DB-touching function, `lib/data.ts#getReservationSmartDefaults(companyId, companyTimezone, customerId?)`,
returning `{ pickupLocation, returnLocation, pickupHour, suggestedDepositMad }`.
Priority order, matching "repeated rentals need dramatically less
input than first-time ones": if a customer is given and has a past
reservation, use *their own* most recent pickup/return location and
deposit amount directly — the strongest, most specific signal. Any
field still missing (first-time customer, or none given) falls back
to a company-wide mode over the last 50 reservations/deposits — a
weaker but still useful signal (e.g. a single/main-branch company's
usual pickup point).

`pickupHour` is company-wide only — one customer's own rentals aren't
enough data points for a meaningful "usual hour" the way a location or
deposit amount is. It comes from real `reservations.pickup_at`
timestamps converted to the company's local hour.

**Known, accurate mock-mode limitation, not a bug**: mock `Booking`
fixtures only carry a plain `startDate` (no time-of-day) — there's no
real hour signal to compute a mode from in mock mode, so the mock
branch always returns `pickupHour: null`, which means the wizard keeps
its pre-existing "10:00" hardcoded fallback exactly as before this
phase. Verified live: with `?pickup=` set (a date but no time),
`ReservationForm` still shows `10:00` as the default time.

## Wiring

`app/(dashboard)/reservations/new/page.tsx` calls
`getReservationSmartDefaults` alongside its existing `getBranches`/
`getChecklistTemplate` calls and passes the result down through
`NewRentalWizard` to:

- `ReservationForm`'s new `defaultPickupLocation`/`defaultReturnLocation`
  props, seeding the previously-always-empty location fields, and
  `defaultPickupHour`, replacing the previously-hardcoded `T10:00`.
- `NewRentalWizard`'s own Step 2 (Payment) `depositAmount` input,
  pre-filled from the new `suggestedDepositMad` prop instead of
  starting empty.

All of these remain fully editable/removable inputs — "suggest," not
force, the same advisory posture every other derived default in this
app already has (returning-customer readiness, preferred category,
etc.).

## Known limitation

The deposit-prefill's actual rendered value (Step 2 of
`NewRentalWizard`) could not be visually confirmed in the browser this
session — reaching Step 2 requires a real reservation row, and
`createReservationInWizard` needs a connected Supabase project (the
same mock-mode mutation gap every phase since roadmap phase 04 has
had). Verified instead by tracing the exact mock fixture data by hand:
Sara Bennis (`cus_3`)'s only booking (`bk_2`) has a linked deposit
(`dep_2`, `collectedMad: 2000`), confirming
`getReservationSmartDefaults` would return `suggestedDepositMad: 2000`
for her — and by the full `tsc`/`lint`/`test`/`build` gate passing,
confirming the prop chain type-checks end to end. The location and
hour defaults (which only require a page load, not a mutation) were
confirmed directly in the browser.
