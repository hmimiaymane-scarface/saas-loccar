# Pricing and Payment Step Simplification

Productization wave 3 phase 24 — "make money entry understandable
without becoming accounting software... the owner understands the
money state in one glance."

## What already existed before this phase

Both `NewRentalWizard`'s Step 2 and `PickupWizard`'s step 2 already
used plain-English labels and had no dense tables — two of the brief's
"avoid" items were already satisfied. The real problem was structural:
a "Rental balance" card (Total/Paid/Remaining) and a separate
"Deposit" card sat side by side, forcing the eye to jump between two
boxes to answer one question ("where do things stand, money-wise?").

There was also no "extras" concept anywhere in the schema —
`lib/pricing.ts#calculatePricing` is rate × days − discount only, and
nothing in `types/rental.ts` models a line item. `PaymentTransactionType`
did already include `"additional_charge"` as a real, existing
transaction type the general `/payments` ledger already supports —
reused here rather than inventing a new backend concept.

## What was built

**`components/domain/money-summary-card.tsx`** — a new, genuinely
shared, pure-presentational component (props only, no logic): one
card, plain rows — Rental price, Extras (only rendered once non-zero),
Total, Paid now, Remaining (amber while > 0, emerald at 0), Deposit
(collected, or "of {expected}" when an expected amount is known).
Replaces the previous two-card layout in both wizards with a single
card the eye never has to leave.

**"Extras" as a single combined action, not an invoice flow** — a
collapsed "+ Add extra charge" control reveals a label + amount
mini-form. Submitting calls the existing `recordPayment` action with
`transactionType: "additional_charge"` — no new backend, no new table.
Modeled as "the customer decided to add something and paid for it
right now" (a walk-up-counter reality, not a two-step invoice-then-pay
flow): the amount is added to the running Extras total and to Paid now
in the same instant, so Remaining is unaffected by adding one. This is
the proportional reading of "extras" given the schema has no
invoice/line-item concept to build a heavier flow on top of, and it
avoids exactly the kind of scope the brief warned against ("avoid...
accounting fields irrelevant at pickup").

Both `NewRentalWizard` and `PickupWizard` got identical treatment:
`MoneySummaryCard` replacing their two summary cards, with the
existing payment-recording and deposit-collecting inputs left exactly
where they were, just below the unified card, plus the same
Extras mini-form and `submitExtra` handler (`PickupWizard`'s version
updates `payment.amountPaidMad` directly and deliberately leaves
`payment.remainingMad` untouched, matching the self-settling design).

## Real verification, and its honest limit

`npx tsc --noEmit`, `npm run lint`, `npm run test`, and `npm run build`
were clean at every checkpoint.

Live mock-mode browser verification was attempted on both wizards:

- `NewRentalWizard`: reachable up through vehicle selection (same path
  proven in phase 23's verification), consistent with every prior
  phase's pattern — creating the reservation itself requires a real
  Supabase mutation, which fails with "Not available in demo mode" in
  pure mock mode. This is the same, already-repeatedly-documented
  mutation gap every phase since roadmap phase 04 has had, not a new
  or phase-24-specific limitation.
- `PickupWizard` (`/reservations/bk_3/pickup`, a real mock reservation):
  the wizard's Documents step rendered correctly on its own (no crash
  at mount, unlike earlier phases' documentation implied — the mount
  effect does not unconditionally call `startInspection`). Clicking
  "Continue" from the Documents step does call `startInspection`,
  which calls `createClient()` and throws `"Supabase is not configured"`
  — caught and rendered by the page's `ErrorBoundaryHandler` as the
  standard "Not available in demo mode" card. Confirmed via
  `read_console_messages`: the stack trace names `startInspection` as
  the origin, one frame under `createClient`. This is the exact same
  class of mutation gap as `NewRentalWizard`'s, just encountered one
  step later in the flow (on advancing past Documents, not at mount) —
  not a regression from this phase's changes.

Net result: `MoneySummaryCard`'s actual pixel rendering inside either
wizard's live payment step was not directly observable this session,
for the same environmental reason (no Supabase project connected) that
has blocked live verification of every DB-mutation-gated feature since
phase 04. Correctness here rests on: a clean `tsc`/`lint` pass (the
component's props are fully typed and both call sites' wiring
type-checks), careful visual design review of the JSX itself, and the
component's deliberate simplicity (conditional rendering + `formatMad`
calls only, no state, no data fetching, nothing left to hide a bug).
