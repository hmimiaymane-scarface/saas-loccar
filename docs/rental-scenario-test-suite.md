# Real Rental Scenario Test Suite

Roadmap phase 61. Brief: "test the product as a rental company, not as
developers." Fifteen named scenarios. "Done when: each scenario has a
repeatable test script and expected result."

## Method and honest scope

This environment has no live Postgres or real-browser access by default
(the standing limitation `AGENTS.md`'s "Testing conventions" section has
carried since phase 03) — every mutating server action throws inside
`createClient()` in mock mode, and no camera/real-device/real-AI-call
surface exists to drive here either. Rather than fake a click-through
that didn't happen, each scenario below is split honestly:

- **Automated** — a real, repeatable Vitest script in
  `lib/__tests__/rental-scenario-suite.test.ts`, one `describe` block
  per scenario, numbered to match this brief. These compose the app's
  actual business-logic functions (deposit math, status-transition
  rules, permission resolution, offline-sync ordering, etc.) and, where
  safely mockable, the real server action itself (`checkCustomerByPhone`,
  `updateReservation`) — not reinvented fixtures.
- **Manual / Tier B** — scenarios (or parts of scenarios) whose real
  substance is a live camera, a real AI vision call, a real device
  going offline, or a live cross-tenant Postgres session. These get a
  numbered manual script + expected result below, same as
  `scripts/phase6-tenant-isolation.ts`/`scripts/phase7-document-pipeline.ts`
  were the live-verification scripts for earlier phases' RLS/storage
  work — not run this session, but written down precisely enough for a
  human (or a future session with live access) to execute.

Run the automated suite: `npx vitest run lib/__tests__/rental-scenario-suite.test.ts`.

## Scenario 1 — New customer + new rental

**Automated**: `checkCustomerByPhone("+212600000000")` (a number no mock
customer has) resolves to `null` — a genuinely new customer is never
mistaken for an existing one. `lib/data.ts#findCustomerByPhone` is
mock-fixture-aware (`isMockMode()` short-circuits before ever touching
Supabase), so this runs against the exact function the intake form
calls, with zero mocking.

**Manual**: driving the full New Rental wizard end to end (customer
create → vehicle select → pricing → confirm) against a real Supabase
project. Wizard-level pricing/availability logic already has its own
dedicated coverage (`lib/__tests__/pricing.test.ts`,
`lib/__tests__/availability.test.ts`) — not re-verified here.

**Expected result**: a phone number not on file never surfaces a
"welcome back" / duplicate-customer prompt.

## Scenario 2 — Returning customer rental

**Automated**: `checkCustomerByPhone("+212 661-234567")` — Khadija
Idrissi's real fixture number (`lib/mock/customers.ts#cus_1`, 6 prior
bookings) — resolves to her actual customer record.

**Expected result**: an exact phone match on an existing customer
returns that customer, enabling the fast-path flow (skip re-entering
identity/licence details) rather than creating a duplicate.

## Scenario 3 — Pickup with photos

**Automated**: `lib/inspections/rules.ts#isPickupInspectionComplete` +
`missingRequiredPhotoSlots` — a pickup missing the last required photo
slot is correctly blocked from completing; capturing every slot
(`REQUIRED_PHOTO_SLOT_KEYS`) makes it complete.

**Manual**: actually driving a phone/tablet camera through the real
capture UI (`components/domain/pickup/pickup-wizard.tsx`) and
confirming the uploaded bytes land in Storage under the right path.
Already a known, standing mock-mode limitation (see this project's
checkpoint memory): the pickup wizard's inspection step blocks past
step 2 in mock mode ("Inspections require a connected Supabase
project") for the same root reason every mutation does.

**Expected result**: an incomplete photo set blocks "Complete pickup";
a full set does not; the specific missing slot names are shown, not
just "incomplete."

## Scenario 4 — Return with no damage

**Automated**: `isReturnInspectionComplete` passes with a full photo
set and a valid (non-decreasing) odometer reading;
`computeDepositStatus(2000, 2000, 2000, 0)` → `"returned"`,
`depositHeldMad(...)` → `0`.

**Expected result**: a clean return completes without a damage
step blocking it, and the full deposit is marked returned with nothing
held.

## Scenario 5 — Return with suspected damage

**Automated**: `computeDepositStatus(2000, 2000, 1500, 500)` →
`"partially_returned"` (500 retained, 1500 handed back, 0 currently
held); `exceedsCollected(2000, 1500, 600)` → `true` — an employee
can never retain more than was actually collected, caught before the
database's own check constraint would reject it.

**Manual**: `lib/damage-detection.ts#compareInspectionPhotos` — the
real AI pickup-vs-return photo comparison — makes a genuine vision-model
call and can't run here without spending real API credits. What's
proven above is the deposit-math consequence once a human (or an AI
suggestion a human confirmed, per `docs/damage-detection.md`'s
propose-then-confirm shape) has actually recorded the damage via
`createDamage` (`DAMAGE_ROLES = owner/manager/agent` — the same
finance-adjacent role list as payments, see scenario 14).

**Expected result**: retaining part of a deposit for damage never lets
the retained+returned total exceed what was collected, and the
remainder stays correctly tracked as still held by the agency.

## Scenario 6 — Outstanding balance

**Automated**: `lib/data.ts#paymentStatusFor` (exported this phase for
exactly this test — previously private) — `(3000, 2000, 1000)` →
`"partial"`, `(3000, 3000, 0)` → `"paid"`, `(3000, 0, 3000)` →
`"unpaid"`. This is the literal branch logic the reservation list/
detail pages derive `payment.status` from (`remaining_balance`/
`amount_paid` themselves come from a database view aggregating the
`payments` table, not app-level math — not re-derived here since it's
a live-DB concern, not a pure-function one).

**Expected result**: a partially-paid reservation is visibly distinct
from both "unpaid" and "fully paid," matching what an owner actually
owes.

## Scenario 7 — Deposit retention

**Automated**: a full lifecycle walk —
`computeDepositStatus(1000, 0, 0, 0)` → `"expected"` →
`(1000, 1000, 0, 0)` → `"collected"` →
`(1000, 1000, 700, 300)` → `"partially_returned"` →
`(1000, 1000, 0, 1000)` → `"retained"`.

**Expected result**: the deposit's displayed status always matches
this exact state machine — no state is skippable or ambiguous.

## Scenario 8 — Rental extension

**Automated**: `updateReservation()` (the real generic edit action)
called against a fixture reservation with `status: "active"` returns
`{ error: "A active reservation can't be edited this way." }` —
proven by actually invoking the action through a small local fake
Supabase client, not just re-reading `isEditableStatus()` in isolation.

**Real product gap found, not a regression** — worth surfacing plainly
rather than assuming away: `rental_extended` is a real, reserved
`activity_log` event type (`types/rental.ts#ACTIVITY_TYPES`, seeded
since the original event-backbone migration, phase 01) that no code
path has ever emitted. `types/rental.ts`'s own comment already says so:
"still reserved, unused vocabulary — [no] rental-extension feature
exists yet." **A rental company hitting this today has no supported way
to push an active rental's return date out** — only to let it run over
(becoming overdue) or complete it and start a fresh booking. This is
pre-existing (predates Wave 8 entirely), not something this phase
broke or something in scope to fix — a future phase building a real
extension flow has a head start: the vocabulary slot already exists.

**Expected result**: the product correctly refuses a silent mid-rental
date edit (a real defensive-correctness win) — but currently offers no
alternative for a legitimate extension request. Flag for product
planning, not a bug ticket.

## Scenario 9 — Vehicle exchange

**Automated**: same `updateReservation()` rejection against an active
reservation, proving vehicle reassignment is blocked the identical way
date changes are (both are the same `vehicle_id` field on the same
generic edit path).

**Real product gap, one step further than scenario 8's**: unlike
extension, there isn't even reserved vocabulary for this — no
`vehicle_exchanged`/`vehicle_reassigned` activity type exists anywhere
in the schema. A broken-down vehicle or a customer upgrade mid-rental
has no supported flow today at all.

**Expected result**: same as scenario 8 — correctly rejected, no
alternative offered. Flag for product planning.

## Scenario 10 — Cancellation

**Automated**: `lib/reservations/status.ts#canTransition` —
`confirmed → cancelled` and `pending → cancelled` both `true`;
`active → cancelled` is `false` **by design**, matching that module's
own documented rule: once active, the only way out is the guided
return flow, never a plain cancel.

**Manual**: the actual DB enforcement lives in
`transition_reservation_status()` (Postgres, `security definer`) —
already exercised live in earlier phases' RLS work, not re-proven here.

**Expected result**: cancelling a not-yet-started booking works; there
is no "cancel" button/path for an already-active rental.

## Scenario 11 — No-show

**Automated**: `canTransition("confirmed", "no_show")` → `true`;
`canTransition("pending", "no_show")` and `("request", "no_show")` →
both `false`.

**Expected result**: only a *confirmed* booking can be marked no-show
— a booking that was never confirmed was never firm enough to "fail to
show up" for; matches real-world usage (you don't no-show an
unconfirmed request).

## Scenario 12 — Document expiry

**Automated**: `lib/alerts.ts#isWithinWarningWindow` — a licence
expiring in 5 days (30-day company warning window) → `true`; one 3
days overdue → `true` (overdue still alerts, the same "overdue counts
as due" convention `lib/documents.ts#getExpiringDocuments`'s own doc
comment names); one expiring in 90 days → `false`.

**Expected result**: an owner sees a soon-to-expire or already-expired
licence/registration flagged; a document with plenty of runway left
doesn't clutter the alert list.

## Scenario 13 — Offline interruption

**Automated**: `lib/offline/sync.ts#isMutationReady` — a queued
damage-photo-attach mutation that depends on a return-inspection
completion stays blocked (`false`) until that prerequisite is marked
done, then becomes ready (`true`). `isAlreadyAppliedMessage` — a
replayed "this inspection was already completed" rejection (the real
shape a flaky connection produces when a prior sync attempt's success
response never reached the device) is correctly treated as a harmless
success, not routed to `needs_review` for a human to untangle; a
genuinely different rejection (a permission error) is not swallowed
the same way.

**Manual**: an actual device going offline mid-pickup, capturing
photos into the local IndexedDB queue (`lib/offline/db.ts`), then
coming back online and draining the queue for real — needs a real
device/browser with real network-toggling, not available in this
environment.

**Expected result**: no operation is silently lost or duplicated across
a real connectivity drop; dependent operations replay in the right
order; a harmless retry-replay never gets flagged as a conflict a human
has to review.

## Scenario 14 — Staff restricted from finance

**Automated**: `lib/permissions/resolve.ts#hasPermission` against the
real per-role default table (`docs/permissions.md`) — an `agent`'s
defaults deny `record_payments` and `approve_refunds` (but correctly
still allow `view_financial_reports` — agents can see the numbers, just
not touch money or approve a refund); a `driver`'s defaults deny
`view_financial_reports` entirely; an `accountant` can `record_payments`
but still cannot `approve_refunds` (owner/manager-only) — proving this
isn't a blunt "financial roles get everything financial" system. A
non-expired owner-granted override still beats the role default (an
agent temporarily trusted with payments). Separately,
`recordPayment`'s own `requireRole()` gate (`PAYMENT_ROLES = owner,
manager, agent, accountant`) is proven to reject a hand-built driver
session directly — real defense-in-depth independent of the permission
engine, since the mock session used everywhere else in this repo's test
suite is pinned to `"owner"` and can't itself simulate a lower-privilege
request.

**Expected result**: a driver/cleaner/mechanic never sees or touches
payment recording or financial reports; an agent can see financial
reports but can't record a payment or approve a refund unless
explicitly granted; every one of these is enforced twice — the
permission engine and the action's own role gate — matching
`docs/security.md`'s standing "RLS (and its app-layer mirrors) is the
real boundary, the UI is not" framing.

## Scenario 15 — Wrong-company user attempts access

**Automated**: one narrow, newly-added slice —
`updateReservation()`'s own `.eq("company_id", companyId)` fetch filter
makes a reservation seeded under a *different* company resolve to
`{ error: "Reservation not found." }`, never leaking that the row
exists or what its status is, when the caller's own session company
doesn't match.

**This is one slice of a much larger, already-existing guarantee — not
duplicated here on purpose**:
- `lib/__tests__/cross-tenant-isolation.test.ts` (roadmap phase 19)
  already proves the application-layer query functions behind
  `customer_intelligence`, `vehicle_intelligence`,
  `operations_feed_items`, `activity_log`, `contract_template_versions`,
  `getTeamMembers`'s override-fetch, and `approval_requests` never
  return another company's row, using the same fake-Supabase-client
  harness (`lib/__tests__/helpers/fake-supabase.ts`).
- `scripts/phase6-tenant-isolation.ts` (productization wave 1 phase 6)
  is the live-Postgres version of this exact scenario: two real
  companies, two real owner users and one real staff user via real
  Supabase Auth, real anon-key sessions (never service-role), attempting
  cross-company reads and writes against vehicles/customers/
  reservations/payments/documents/contracts. All 16 checks passed the
  last time it was run against the live project. Re-run any time with
  `npx tsx scripts/phase6-tenant-isolation.ts` (needs `.env.local`'s
  real project credentials). See `docs/security.md`'s "Cross-tenant
  isolation testing" section for the full writeup of what it covers.

**Expected result**: a user from Company B can never read, edit, or
even detect the existence of Company A's reservations (or any other
tenant-scoped row) by id-guessing — confirmed at both the
application-query layer and, via the live script, the real RLS layer.

## Verification

tsc/eslint/791 tests (774 existing + 17 new)/build all clean. The one
production change alongside the new test file: `lib/data.ts`'s
`paymentStatusFor` changed from a private to an exported function
(scenario 6) — pure rename of visibility, no behavior change, and
`git diff` confirms it's the only non-test-file edit this phase made.
