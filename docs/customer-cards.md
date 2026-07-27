# Customer Cards

Productization wave 2 phase 16 — "make customer lookup operational,
not CRM-heavy... customer pages feel like rental tools." Sibling to
phase 15's fleet cards; same shape of change (a redesigned card + a
new page-scoped enrichment function), applied to `/customers`.

## What's on the card now

1. Name + phone
2. Verified identity state (`Verified` / `Not verified`, always shown)
3. Current rental if any, otherwise last rental, otherwise "No rentals
   yet"
4. Outstanding balance — only shown when it's actually greater than 0
5. A trust signal — **suppressed unless the cached band is `"poor"`**
   (the brief's own "only if it changes a decision": a fine trust
   score changes nothing an agent does at a glance)
6. Three real actions: **Call** (`tel:`), **New rental** (the existing
   `?customerId=` fast path from roadmap phase 09), **History** (the
   existing `/customers/{id}` detail page)

**No WhatsApp action.** The brief says "later," not now, and no
WhatsApp integration exists anywhere in this codebase yet (`whatsapp`
only appears as an unconfigured notification channel and as a
reservation-source enum value — neither is a messaging integration).
This app's own convention is to never ship a button for a channel
that isn't actually wired up.

## The data: `lib/data.ts#getCustomerCardContext`

Mirrors phase 15's `getFleetCardContext` batching technique exactly —
scoped to the customers actually displayed, not re-implemented per
card:

- **Current/last rental** — reuses the same reservation-status logic
  `getCustomerDetail` already has for a single customer
  (`activeRental`/`outstandingBalanceMad`), generalized to a batch.
  "Last rental" is a genuinely new concept (didn't exist anywhere
  before this phase): the most recent `completed` reservation, kept
  distinct from `currentRental` (always `active`) so a card never
  shows both.
- **Verified identity** reuses `assessReturningCustomerReadiness`
  (roadmap phase 09) exactly, fed by one batched `documents` query —
  no new readiness logic, just run across a page instead of one
  customer.
- **Trust signal** reads the already-cached `customer_intelligence`
  table directly (`trust_band` column) — no recompute triggered by
  viewing the list. A customer who's never had their detail page
  opened simply has no cached row yet and shows no signal, same
  "not yet computed" degrade every cached-intelligence read in this
  app already has.

## Known limitation

`getCustomers()` still has no pagination — it fetches the entire
company's customer list in one request, same as before this phase.
The new enrichment query is scoped to whatever that call returns, so
it's only as cheap as `getCustomers()` itself already is. A real,
separate scalability gap, confirmed pre-existing and not introduced by
this phase — out of "customer cards"' own scope to fix.
