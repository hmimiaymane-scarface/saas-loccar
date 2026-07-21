# Customer Command Center, Timeline & Returning-Customer Fast Path

Roadmap phase 09 — bible Chapter 3 §6 ("Customer profiles should
become relationship dashboards. Not contact cards."), Chapter 5 §14
("Customer Timeline"), and Chapter 6 §4 ("Returning Customer
Workflow... often less than two minutes"). Mirrors phase 07's vehicle
detail page rebuild, applied to customers, and reuses phase 08's trust
score/CLV/duplicate-detection work rather than recomputing anything.

## The pieces

- `lib/customer-readiness.ts` — pure. Decides whether a returning
  customer can skip straight to vehicle selection, or needs one
  specific thing fixed first.
- `lib/customer-favorites.ts` — pure. Frequency-counts a customer's
  own reservations to surface repeat vehicles.
- `lib/data.ts#getCustomerTimeline` — the database-facing query behind
  the Customer Timeline.
- `components/domain/customers/customer-intelligence-card.tsx` — the
  Overview section (trust score + CLV), same shape as phase 06/07's
  `VehicleIntelligenceCard`.
- `components/domain/customers/customer-readiness-card.tsx` — the
  fast-path readiness check, rendered on the customer page itself with
  a real fix action, not just a warning.
- The customer detail page (`app/(dashboard)/customers/[id]/page.tsx`)
  and the reservation form (`components/domain/reservations/reservation-form.tsx`)
  both consume the readiness/favorites/timeline pieces above.

## Customer Command Center

Same "One Screen, One Goal" progressive-disclosure discipline as phase
07: an AI summary banner leads the page (phase 08's
`generateCustomerSummary`, one or two sentences, requirement 3), then
an Overview card (trust score + lifetime revenue, rentals/year,
average reservation, expected future value, preferred category),
then the timeline, reservation history, favorite vehicles, and
documents. The header now states tenure ("Customer since ...", a new
`CustomerDetail.customerSince` field sourced from `customers.created_at`
— nothing before this phase exposed it) and adds a **Start rental**
button that's the fast path's entry point.

**The bible's list has two items this phase deliberately doesn't
build a UI for**, same restraint `docs/customer-intelligence.md`
already applied elsewhere:
- **Communication history** — no messaging/comms concept exists
  anywhere in this codebase yet (no channel, no log). Not faked.
- **Deposit history** as its own ledger view — deposit-related events
  already appear in the Timeline (`deposit_collected` /
  `deposit_returned` / `deposit_retained`), and the trust score's
  deposit factor already summarizes it numerically. A dedicated raw
  ledger view is a reasonable future addition, not required to satisfy
  "deposit history" being represented somewhere real.

"AI suggestions" in the requirement's bullet list and "AI-generated
customer summary" in requirement 3 are the same one thing — phase 08
built a single summary sentence for customers, not a
recommendations-array engine like vehicles get
(`docs/customer-intelligence.md` says as much: "no UI renders it yet;
that's phase 09's Customer Command Center"). Building a second,
separate customer recommendations engine here would be new scope this
phase wasn't asked to add.

## Customer Timeline

`getCustomerTimeline()` is more involved than phase 07's vehicle
timeline. The vehicle version filters on a single reliably-stamped
`metadata->>vehicle_id`; no equivalent single key exists for
customers, because `customer_id` is only stamped in one call site
(`payments/actions.ts#recordPayment`, and only for documents/payments
— see below). So the query combines four predicates instead of one:

1. `entity_type = customer AND entity_id = <id>` — the customer's own
   account events (`customer_created`, `customer_updated`).
2. `metadata->>reservation_id IN (<their reservation ids>)` — every
   event on one of their reservations: the reservation itself,
   deposits, damages, inspections, and reservation-linked payments.
   This is the same key every reservation-lifecycle event already
   carries (see `docs/vehicle-command-center.md`'s timeline section),
   just filtered by a set of ids instead of one.
3. `entity_type = document AND entity_id IN (<their document ids>)` —
   documents uploaded straight to the customer (an identity scan
   isn't always tied to a specific booking).
4. `metadata->>customer_id = <id>` — the one event type that already
   carries this directly: a payment recorded with no reservation at
   all (a walk-up payment). Also catches `document_uploaded` for
   customer-linked documents, since `documents/actions.ts` already
   stamps `customer_id` into that event's metadata too — predicate 3
   is kept anyway as a defensive fallback, not because it's currently
   load-bearing for every case.

`customerId` reaches this function from a route param, but it's
spliced into a raw PostgREST `.or()` string (no parameterized form
exists for that clause), so it — and every reservation/document id
pulled in along the way — is validated against a UUID pattern before
being interpolated, the same caution `escapeIlike` already applies to
free-text search elsewhere in `lib/data.ts`.

Mock mode has no equivalent multi-predicate SQL, so it filters
`mockRecentActivity` directly on `customerId`/`reservationId` fields
(both new/extended on `ActivityItem`) — the same fixtures phase 07
already started enriching with real ids, now covering Ahmed Tazi's
payment and (fixing a pre-existing mismatched reference) Mehdi
Chraibi's contract upload.

## Returning-Customer Fast Path

`lib/customer-readiness.ts#assessReturningCustomerReadiness` reuses
exactly the two signals phase 08's trust score already treats as "this
person is verified" — deliberately not a third, competing definition:

- **Driving licence**: `customers.license_expires_on` — the same field
  the customer detail page already displays and flags red when
  expired. Missing or in the past → an issue.
- **Identity**: an active `identity_document`-category upload — the
  same presence check `customer-intelligence-store.ts`'s
  `hasVerifiedIdentity` factor uses — now also checked for its own
  expiry if one was recorded. (`documents.expires_on` already existed
  as a column since phase 04's extraction pipeline; it just wasn't
  selected on any customer-facing read path until this phase added it
  to `RentalDocument`/`DOCUMENT_SELECT`/`mapDocumentRow`.) Multiple
  active identity documents only count as expired when *all* of them
  are — one current document is enough.

Both the Customer Command Center (`CustomerReadinessCard`) and the
reservation form itself show the same check, computed once per page
load from data already fetched (no new query). On the Command Center,
an identity-document issue comes with a real, working fix in place —
a `DocumentUploadRow` for that exact slot, reusing the same component
the pickup wizard already uses — not a link elsewhere. A licence-date
issue points at the existing "Edit" form rather than duplicating a
single-field editor.

**The interrupt never blocks.** Same precedent as phase 08's trust
score ("never replaces judgment, it simply informs it") and duplicate
detection (surfaces for review, never a hard block): the reservation
form's banner names the specific problem and links to fix it, but the
Create button stays enabled regardless. A member of staff might
already know the customer is bringing a renewed licence to pickup —
this app doesn't invent a new hard gate to relitigate that call.

**What actually gets faster, concretely** (acceptance criterion: "meaningfully
fewer clicks/screens, demonstrate this concretely"), reached via the
Command Center's **Start rental** button
(`/reservations/new?customerId=<id>`):
1. Customer search (type + click a result) is skipped entirely — the
   customer arrives pre-selected, reusing the `preselectedCustomer`
   mechanism that already existed for the "just added a customer"
   flow.
2. The vehicle category filter pre-fills from phase 08's CLV
   `preferredCategory` (`defaultCategory` prop, new this phase) —
   skips the manual category pick.
3. If pre-filling the category narrows availability to exactly one
   vehicle, the existing `shouldAutoSelectSingleOption` auto-selection
   (built for a different reason in an earlier phase) fires on its
   own — skipping the vehicle click too.
That's up to three interactions removed versus the first-time flow,
without inventing any new UI mechanism — every piece reuses something
this codebase already had.

## Known limitations (intentional)

- **Live-only**: `defaultCategory` (via `getCustomerIntelligence`) and
  the AI summary/trust/CLV Overview card all degrade to null/hidden in
  mock mode, same as phase 06/07's vehicle intelligence — verified via
  the browser (mock mode) that the page still renders correctly
  without them, not that the scores themselves compute in mock mode
  (they don't; that's exercised by the phase 08 unit tests instead, on
  a mocked Supabase client).
- **The readiness banner can go stale after an in-place document
  upload** — `createDocumentRecord` already calls
  `revalidatePath('/customers/[id]')`, but the already-rendered client
  component doesn't automatically re-fetch server data without a
  navigation/refresh. `CustomerReadinessCard` optimistically shows the
  new document via local state (the `DocumentUploadRow`'s `existing`
  prop turns green immediately) but the issue text above it won't
  recompute until the page is reloaded. Same category of limitation as
  every best-effort async recompute elsewhere in this app.
- **No new Supabase migration needed** — `documents.expires_on` and
  `customers.created_at` both already existed; this phase only started
  selecting them. `customer_intelligence` (phase 08) remains unapplied
  to the live project, same recurring situation since phase 03 (no
  Docker/Supabase CLI available locally) — not exercised live for that
  reason, verified instead via the browser in mock mode (Customer
  Command Center layout, readiness card in both the ready and
  interrupted states, the fast-path banner in both states, light and
  dark) and via phase 08's existing unit test coverage for the
  score computations themselves.
- Mutations (`createReservation`, `createDocumentRecord`, `updateCustomerProfile`)
  remain live-Supabase-only — the same pre-existing, repeatedly
  documented limitation every phase since 04 has noted, not something
  this phase introduced or could route around.
