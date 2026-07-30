# Customer Communication Timeline (roadmap phase 46, wave 6 continued)

Goal: give owners context without building a full CRM. "Done when":
the customer page answers "What have we already done with this
customer?"

## Built directly on the immediately-prior two phases

Phase 45 built 5 `wa.me` deep-link buttons (confirmation, pickup
reminder, return reminder, payment reminder, contract-sent) with **zero
logging** — each was a plain `<a>` tag. Phase 45's own docs named this
explicitly as a non-goal at the time ("did not add a message-send
history/log"). Phase 09 already built a real customer timeline
(`EntityTimeline` + `getCustomerTimeline`) that this phase's brief
turns out to need no new query code for — the existing OR-clauses
(`entity_type=customer`, `metadata->>customer_id`,
`metadata->>reservation_id` for the customer's own reservations)
already cover exactly the shape a new logged event needs.

## What's new

- **6 new `ActivityType` values** (`types/rental.ts` + matching
  migration + the existing drift-guard test in
  `lib/__tests__/activity-log.test.ts`, same three-places pattern
  every prior addition to this list has followed): one per phase-45
  WhatsApp button, plus `call_logged` for the Call button. Named and
  commented as **"the moment staff clicked, not confirmed
  delivery"** — this app has no way to know whether a WhatsApp draft
  was actually pressed Send on inside WhatsApp itself, or whether a
  dialed call was answered. "Sent"/"logged" in the type names and
  timeline titles matches the brief's own vocabulary ("Payment reminder
  sent"), but the honest caveat lives right at the `ACTIVITY_TYPES`
  definition and here, not hedged into every timeline row's UI text —
  same "the honesty lives in the docs/comments, not cluttering every
  string" precedent as this app's contract-signature framing.
- **`logCommunicationAction`** (`app/(dashboard)/customers/actions.ts`)
  — a best-effort `recordEvent` wrapper, same convention as
  `logContractViewedAction`: a failed log write must never surface as
  an error to someone who just opened WhatsApp or dialed a number,
  since the primary action already happened outside this app's control
  by the time this fires. Always writes `entityType: "customer"` (the
  existing timeline's most direct match) plus
  `metadata.reservation_id` when one's available.
- **`WhatsAppButton` is now a client component** (was a plain
  server-rendered `<a>`) with an `onClick` that fires the log action
  in an unawaited transition — the anchor's own `target="_blank"`
  navigation is native and synchronous, so the log call never blocks
  or delays it. New **`CallButton`** follows the identical shape for
  `tel:` links, which previously rendered raw and un-logged everywhere
  in this app.
- Wired into all 5 phase-45 WhatsApp buttons (reservation detail page
  ×4, contract page ×1) and the reservation detail page's Call button.
  Existing raw `tel:` links elsewhere (`customer-list-item.tsx`,
  `pickup-wizard.tsx`) are untouched — adopting `CallButton` there is a
  separate, later choice, not required by this phase's own scope
  (those aren't reservation-context actions with a natural
  reservation-linked log entry the same way).

## What this phase deliberately didn't do

- **Did not build a "log a call" note/detail UI** (call outcome, notes,
  duration) — the brief's "calls manually logged if useful" is
  satisfied by logging the one real, observable moment (the Call
  button was clicked), matching the same restraint as the WhatsApp
  side rather than inventing a separate manual-entry form phase 45's
  "start simple" spirit argues against.
- **Did not add logging to the raw `tel:`/`wa.me`-adjacent links
  outside the reservation/contract context** (customer list,
  pickup/return wizards) — out of this phase's named scope (reservation
  and contract pages), a reasonable later extension.
- **Did not attempt to infer delivery/read status** — no read receipts,
  no "message delivered" webhook, nothing beyond "staff took this
  action." Consistent with `wa.me`'s own fundamental limits (phase 45)
  and stated as a real constraint, not a partial implementation.

## Verification account

Real browser pass in mock mode confirmed the two things actually
observable without live Supabase:
- Clicking "Return reminder" opened a genuine new tab navigating to
  WhatsApp's real send endpoint with the correct phone and message
  text, completely unimpeded by the logging `onClick` running
  alongside it — proving the log call never blocks/delays the real
  action, the core design requirement for wiring this onto a live
  external navigation.
- Zero new console errors after the click — confirming
  `logCommunicationAction`'s best-effort try/catch correctly swallows
  the same "Supabase is not configured" failure every mutation in this
  app hits in mock mode, rather than surfacing it or crashing anything.

**Not reachable live, same recurring gap as every mutation-adjacent
phase since 04**: actually seeing the new timeline entry appear on the
customer page, since `activity_log` writes are a real mutation that
throws in mock mode before ever reaching a table. Verified instead by
code review: `getCustomerTimeline`'s existing OR-clauses were read
directly and confirmed to already cover `entity_type=customer` (this
phase's entries) with no changes needed on the query side.

tsc/eslint/708 vitest tests/`next build` all clean at every checkpoint
(no new tests added — the 6 new type entries are covered by extending
the existing drift-guard test; `logCommunicationAction` itself is a
thin, best-effort side-effect wrapper in the same vein as
`logContractViewedAction`, which also has no dedicated test).
