# WhatsApp Operational Actions (roadmap phase 45, wave 6 continued)

Goal: meet owners where customer communication already happens. "Done
when": common customer communication can begin from the relevant
RentalOS record. Brief explicitly says "start simple... do not
over-automate before templates and consent behavior are validated."

## The core design call: `wa.me`, not a Business API

WhatsApp's own public "click to chat" link
(`https://wa.me/<phone>?text=<prefilled message>`) needs no API key, no
Business account, no webhook — it opens WhatsApp (web or the app) with
a draft message the recipient's employee still has to review and press
Send on themselves. This is a materially different, much smaller thing
than the "WhatsApp integration" this app's existing code already
gestures at in two places, and this phase deliberately does **not**
try to become that:

- `lib/notifications/channels/index.ts`'s `whatsapp` channel (phase 18)
  stays exactly as unconfigured as it was — that channel is for
  *automatic, unattended* sending (a cron job messaging a customer with
  no human reviewing it first), which is a genuinely different,
  larger, riskier thing than what this phase builds. Left untouched on
  purpose, not an oversight.
- `contract-pdf-actions.tsx`'s "Send" button (phase 26) was a
  permanently disabled stub, framed around "available once WhatsApp or
  email is connected" — that framing assumed the Business-API version.
  This phase replaces it with a **real, working** `wa.me` link, since
  the thing it was actually waiting for (an API connection) was never
  the real requirement.

**This is also the answer to the brief's "consent behavior... not
validated yet" concern**, stated explicitly rather than built as a
separate gating mechanism: every message this phase produces requires
a human to open WhatsApp, read the draft, and choose to press Send.
Nothing is ever transmitted automatically. That human-in-the-loop step
*is* the consent safeguard for an operational/transactional message —
a per-customer opt-in/opt-out toggle would only matter once messages
started sending without a person reviewing each one, which is
precisely the automation this phase's own brief says not to build yet.
`marketing_consent` (phase 08) was deliberately **not** reused as a
gate here — it exists for marketing-campaign segmentation
(`lib/customer-segments.ts`), a different concept from an operational
"your pickup is in 2 hours" message a human is sending by hand.

## What's new

- **`lib/whatsapp.ts`** — `normalizePhoneForWhatsApp`/`buildWhatsAppUrl`.
  Existing `tel:` links elsewhere (`customer-list-item.tsx`,
  `pickup-wizard.tsx`) interpolate the raw stored phone string
  unchanged, which is harmless for `tel:` but would break `wa.me`
  (digits-only, country code, no `+`/spaces/dashes required). This is
  the one normalizer that actually matters for the new requirement.
- **`lib/whatsapp-messages.ts`** — one plain-text builder per message
  type named in the brief (confirmation, pickup reminder, return
  reminder, payment reminder, contract). Deliberately plain, editable
  strings, not a templating engine with named placeholders — matches
  "start simple," and the text is still fully editable by the sender
  inside WhatsApp's own prefilled-text box before it's ever sent.
- **`components/domain/whatsapp-button.tsx`** — the one shared way a
  `wa.me` action renders anywhere in the app. Renders nothing when the
  phone doesn't normalize to something usable, same "never a dead
  button for an unavailable channel" rule
  `lib/notifications/actions.ts#callAndOpenActions` already follows.
- **Reservation detail page** (`app/(dashboard)/reservations/[id]/page.tsx`) —
  a Call button plus contextual WhatsApp buttons in the Rental card
  (Send confirmation for request/pending/confirmed, Pickup reminder for
  pending/confirmed, Return reminder for active) and the Pricing card
  (Payment reminder whenever a balance remains) — all behind the same
  `canManage` check the page's other action buttons already use.
- **Contract view page** — the phase-26 disabled "Send" stub is now a
  real `WhatsAppButton`, pulling customer name/phone and the
  reservation reference straight out of the contract's own
  `resolved_context` snapshot (the exact data template-variable
  substitution already used — no new query). The message includes the
  signed PDF's own URL when one exists.

## What this phase deliberately didn't do

- **Did not touch the `whatsapp` notification channel** or attempt any
  real Business API integration — see the design-call section above.
- **Did not add a message-history log** (no record of what was sent,
  when, to whom) — `wa.me` is a fire-and-forget deep link with no
  server-side visibility into whether the message was actually sent or
  read; building a log would mean guessing at delivery status this app
  genuinely cannot observe. A future real-integration phase is the
  right place for that, not this one.
- **Did not add email alongside WhatsApp on the contract "Send"
  button** — the brief names Call and WhatsApp only; `mailto:` has no
  reliable way to attach the actual PDF (just a link, same as the
  WhatsApp message), and re-adding it as a second still-fake stub next
  to one real button would be worse than leaving it out.
- **Did not build a per-message-type customization/settings UI** — the
  five message strings are hardcoded in `lib/whatsapp-messages.ts`.
  Making them owner-editable is a real, reasonable future addition,
  explicitly out of "start simple" scope here.

## Verification account

Real browser pass in mock mode, both themes, confirmed correct across
all three reservation states this phase's logic branches on:
- **Requested** (RB-3400): Call + "Send confirmation" render, no Pickup/
  Return reminder (correctly not yet relevant), Payment reminder
  renders (balance owed).
- **Active** (RB-3391, RB-3394): Call + "Return reminder" render, no
  Send confirmation/Pickup reminder (correctly no longer relevant),
  Payment reminder renders only when a balance actually remains.

Extracted the real rendered `href` values directly via the browser
console and confirmed both the phone normalization and message text
are correct end-to-end for a real customer/reservation, e.g.:
`https://wa.me/212664778120?text=Hi%20Mehdi%20Chraibi%2C%20just%20a%20reminder%20—%20your%20return%20for%20reservation%20RB-3394%20is%20due%20Wednesday%2022%20Jul%2C%2010:00%20at%20Marrakech%20Menara%20Airport...`
— a real, correctly-encoded, immediately-usable link.

**Not reachable live, same recurring gap as every mutation-adjacent
phase since 04**: the contract-page "Send" button specifically,
because reaching it requires a real generated contract, and contract
generation is a mutation that throws in mock mode
(`createClient()` unconditional call, documented since phase 04).
Verified by code review instead — it reuses the exact same
`WhatsAppButton` component already proven live on the reservation
page, fed by `resolved_context` fields already proven correct by
phase 10's own contract-generation tests.

14 new unit tests (`lib/whatsapp.ts`/`lib/whatsapp-messages.ts`), tsc/
eslint/708 vitest tests/`next build` all clean at every checkpoint.
