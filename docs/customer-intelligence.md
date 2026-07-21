# Customer intelligence (trust score, lifetime value, duplicates)

Roadmap phase 08 — the bible's Pillar Two, Chapter 5 §13-17. Every
customer gets a computed trust score/band, a lifetime-value projection,
and an AI status summary, cached in `customer_intelligence` (one row
per customer, mirroring phase 06's `vehicle_intelligence`). Duplicate
detection (originally phase 04, document-level only) is extended into
a full customer-record concept and wired into both customer creation
and editing.

## The pieces

- `lib/customer-intelligence.ts` — pure scoring (`computeTrustScore`,
  `computeCustomerLifetimeValue`). No Supabase dependency; every
  formula is unit-tested against hand-computed fixtures.
- `lib/customer-summary.ts` — the first customer-domain caller of
  phase 05's `askAI()`. Data/logic only per requirement 5's explicit
  instruction — no UI renders it yet; that's phase 09's Customer
  Command Center.
- `lib/customer-intelligence-store.ts` — the database-facing
  orchestrator: gathers one customer's full history, runs the pure
  functions, generates the summary, and upserts the cache row.
- `lib/customer-matching.ts` — extended (not rebuilt) from phase 04
  with phone/email/date-of-birth matching factors.
- `lib/customer-segments.ts` — consent-gated marketing segmentation
  query logic (requirement 4). No campaign/messaging infrastructure
  (non-goal).

## Trust score

Six weighted factors (weights sum to 100): document verification (20),
rental history (20), on-time returns (15), damage frequency (15),
payment reliability (15), deposit history (15). Bands: 85+ excellent,
65+ good, 40+ fair, below 40 poor — same thresholds as phase 06's
vehicle health bands, independently defined (not shared code — see
`lib/vehicle-intelligence.ts`'s own `bandForScore`; two small, separate
4-line functions rather than a forced cross-domain import).

**The bible lists seven trust factors; this codebase has a real data
source for six.** "Previous disputes" is approximated via deposits
with `status = 'disputed'` or a nonzero `retained_amount` — the only
dispute-shaped signal that exists; there's no separate complaints/
disputes table. **"Communication" reliability has no data source
anywhere** and is not computed, not guessed at, and not silently
folded into another factor.

"Late returns" is derived from the event backbone (phase 01), exactly
as requirement 6 asks: for each completed reservation, look up its
`vehicle_returned` activity_log event (filtered on
`metadata->>reservation_id`, the same field every reservation-lifecycle
event already carries — see `docs/vehicle-command-center.md`'s timeline
section for why) and compare that event's `created_at` to the
reservation's scheduled `return_at`. There's no dedicated "actual
return timestamp" column in this schema; the event backbone is the
source of truth for when something actually happened.

"Payment reliability" uses `reservations.remaining_balance` (a
generated column) rather than a payments-vs-due-date comparison —
counting completed reservations that still had a balance outstanding
at completion, the closest available proxy without a dedicated
due-date concept.

**Trust score is advisory only, per the bible's non-negotiable: "The
Trust Score never replaces judgment. It simply informs it."** Nothing
in this phase gates or blocks a rental based on it — it isn't checked
anywhere in the reservation-creation flow.

## Lifetime value

Lifetime revenue = recorded `rental_payment` + `additional_charge` +
`damage_charge` payments, minus `refund` payments, for this customer
(same definition family as `lib/data.ts#getFleetPerformanceReport`'s
revenue concept, scoped to a customer instead of a vehicle). Rental
frequency = reservation count ÷ tenure in years; average reservation =
lifetime revenue ÷ reservation count; expected future value = average
reservation × frequency — **a simple same-rate projection, explicitly
not a forecasting model**, per the phase brief's own instruction not to
over-engineer it. Preferred category is the mode of vehicle category
across active/completed reservations (null if there isn't enough data).

## Duplicate detection: extended, not rebuilt

Phase 04 already matched on name/id-document/licence-number for
document-level duplicate detection, wired into `createCustomer` only.
Phase 08 requirement 3 extends the same engine
(`lib/customer-matching.ts`) with phone, email, and date-of-birth, and
wires the same check into `updateCustomerProfile` too.

**A real design change, not just an addition**: `createCustomer`
previously had a *separate*, unconditional hard block on an exact
phone match (`findCustomerByPhone`) — no override, just a "use the
existing one" link. That block is retired in favor of one unified
scored flow. The phase's own acceptance criterion explicitly names
"same phone reused legitimately" as a false-positive risk to think
about — the old hard block had zero escape hatch for that case,
contradicting the bible's own Merge / Keep Separate / Review Later
philosophy for exactly this scenario. The new weights are calibrated
so an exact phone or email match:
- **alone**, surfaces as a review-later signal (never silently
  invisible — an exact match is still real information) but never a
  confident "likely duplicate,"
- **combined with a name match**, does cross the "likely duplicate"
  bar, same as before.

Weights: id-document/licence number 55 each (practically unique to one
person), phone/email 40 each, date of birth 15 (many people share a
birthday — supporting signal only), name similarity up to 40 (only
above a 0.85 fuzziness floor). See
`lib/__tests__/customer-matching.test.ts`'s explicit false-positive
cases: a shared phone alone, a shared email alone, a coincidentally
shared birth date alone, and — the acceptance criterion's named
example — two different people sharing only a last name (e.g.
father/son), even when they also share a household phone.

`normalizePhone`/`normalizeEmail` are deliberately simple (digits-only;
lowercase+trim) — no country-code reconciliation or email-alias
normalization. A full phone-number parser is out of scope, same
restraint `normalizeIdLike` already used for licence/ID numbers.

## Consent-gated segmentation

`marketing_consent` (new `customers` column, defaults `false` — opt-in,
not opt-out) is the gate every function in `lib/customer-segments.ts`
checks before anything else: `getInactiveCustomers` (rented before, not
recently), `getFrequentCategoryRenters` (N+ rentals of one vehicle
category), `getUpcomingBirthdays` (needs `date_of_birth`, also new).
Each has an explicit test that inspects the actual query calls made,
proving the consent filter is really there — not just trusted from
reading the code, per the phase's own acceptance criterion. No
campaign-sending infrastructure exists or was built (non-goal) — this
is query logic only, for a future phase to build a sending UI on top of.

## Recompute triggers (requirement 6)

Same synchronous, best-effort, no-background-job-infra convention as
every prior phase's event-triggered recompute:

- `completeRentalAction` (`app/(dashboard)/reservations/actions.ts`) →
  both the vehicle (phase 06) and the customer, reason
  `"vehicle_returned"`
- `recordPayment` (`app/(dashboard)/payments/actions.ts`) → reason
  `"payment_recorded"`
- `createDamage` (`app/(dashboard)/damages/actions.ts`) → only when the
  damage is linked to a reservation (damages have no `customer_id` of
  their own — one recorded outside any specific rental has no customer
  to recompute), reason `"damage_recorded"`

A customer who's never triggered any of these computes lazily on first
read (`getCustomerIntelligence`, reason `"initial_view"`).

## Known limitations (intentional, for a future phase)

- **No customer profile UI beyond what's needed to verify the scores
  compute correctly** — the full Customer Command Center, including
  where the AI summary actually renders, is phase 09 (non-goal).
- **No campaign/messaging sending infrastructure** — segmentation is
  query logic only (non-goal).
- **Phone/email normalization is simple, not a full parser** — see
  above.
- **"Communication reliability" isn't computed** — no data source
  exists anywhere in this codebase for it.
- **The `customer_intelligence` migration and the two new `customers`
  columns haven't been applied to the live Supabase project** — same
  recurring situation as every table/column added since phase 03 (no
  Docker/Supabase CLI available locally). Trust score/CLV/summary were
  **not** exercised live for this reason — verified instead via unit
  tests (mocked Supabase client, hand-computed fixtures, including one
  full end-to-end trust-score-and-CLV pipeline test).
  **What *was* verified live, in the browser, in mock mode** (which
  `findDuplicateCandidates` supports, unlike the scores): the
  `/dev/document-extraction` duplicate-check panel (extended with the
  new phone/email/date-of-birth inputs) reproduced the exact two
  calibration cases from the unit tests — "Youssef Tazi" + Ahmed Tazi's
  phone number surfaced at 40% with no "Likely duplicate" badge; "Ahmed
  Tazi" + the same phone surfaced at 80% and was flagged likely — and
  both `customer-form.tsx`/`customer-edit-form.tsx` render the new date-
  of-birth field and marketing-consent checkbox correctly, pre-filled
  correctly on edit. The actual create/edit *submission* still can't be
  exercised in mock mode — `createCustomer`/`updateCustomerProfile`
  call `createClient()` unconditionally before any mock-mode branching,
  same pre-existing limitation phase 04 already documented, not
  something this phase introduced or could route around without
  touching how every mutation in this codebase is structured.
