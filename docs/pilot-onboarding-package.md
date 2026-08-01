# Pilot Onboarding Package

Roadmap phase 63. Brief: "prepare the first real agency experience" —
setup checklist, data import, contract template, owner account, PWA
install, a 10-minute walkthrough, a backup contact method for issues,
and feedback capture. "Done when: a pilot can begin without explaining
internal architecture."

**What this phase found, honestly**: six of the eight required pieces
already existed, built across Waves 1-8 — this phase's real work was
assembling them into one handoff-ready package and building the two
genuinely missing pieces (a backup contact method and feedback
capture). The section below is written to be read *by* a pilot (or
alongside one, on a call) — plain language, no internal jargon. The
engineering section further down explains what's new, what's reused,
and how it was verified.

---

## Welcome to RentalOS

This is what happens between now and your first real rental booked in
the system — about 15-20 minutes of setup, most of it guided.

### 1. Create your account

Go to `/sign-up`, then the setup wizard: your company name, city,
phone, currency, and language. This creates your real company and your
real owner login — nobody else can do this step for you (not even us),
so it's the one thing you do first, live, ideally with us on a call so
we can answer anything as it comes up. Everything past this point can
be done by whoever you invite in — including us, if you'd like hands-on
help getting started (see step 3).

### 2. Bring in your existing fleet and customers

Send us (or upload yourself, under **Import data**) your current
fleet/customer spreadsheet — Excel, Google Sheets, whatever you already
have, however messy. `/import` matches your columns automatically where
it can, flags anything it isn't sure about for you to review, and shows
you a before-you-commit preview and duplicate check. Nothing is written
until you approve it.

### 3. Invite us in, if you want white-glove setup

If you'd rather we do the spreadsheet cleanup, the import, the logo
upload, and the contract template ourselves: invite us as a **Staff**
member (the wizard's Team step, or later from **Team**) — never share
your password, an invite is all we need. We do the rest inside your
real account and hand it back to you fully set up.

### 4. Set your contract template

Under **Contract templates** (or the wizard's Contract step), upload
your existing rental agreement as a PDF — RentalOS reads it and
proposes where each field (customer name, dates, price, ...) goes
automatically. Review and confirm; you can always add more templates
or adjust this one later.

### 5. Install RentalOS on your phone

On your phone's browser, open RentalOS and either accept the "Install
app" prompt Chrome/Android shows, or on iPhone: tap the Share icon, then
"Add to Home Screen." It behaves like a normal app from then on — its
own icon, opens full-screen, works offline for field work (pickups,
returns, photos) even with no signal, syncing automatically once you're
back online.

### 6. Your first 10 minutes in RentalOS

A short guided lap through the four things you'll do every single day.
Do this once, live, with whoever will actually run the front desk.

1. **Open the app. Look at Home.** This is your morning check —
   available/rented/returning-today counts, and a list of anything that
   needs attention today (an overdue return, a document about to
   expire, an unpaid balance). Start every day here.
2. **Tap the "+" button (mobile) or "New Rental" (desktop).** Search
   for a customer by name or phone — if they've rented from you before,
   they'll show up instantly; if not, add them in the same flow, no
   separate screen. Pick a vehicle, confirm dates and price.
3. **Open that new reservation and tap "Manage return"/"Pickup"** —
   walk through what the field-handoff steps (photos, odometer, fuel
   level) look like, even without completing one for real yet.
4. **Tap Money (or Payments), then "Record a transaction."** This is
   how you log a payment, a deposit, or an expense — cash, card, or
   transfer, whichever you actually collected.

That's genuinely most of a normal day. Everything else (reports,
contracts, maintenance, team) lives one tap away under **More**.

### 7. If something breaks or looks wrong

Go to **Help & Support** (in **More**, or `/support`). You'll always
find a direct WhatsApp/email link there — even if the app itself is
misbehaving, that page is meant to work regardless. Use it, don't
wait — a two-line message from you the moment something's confusing is
worth far more to us than a perfect bug report a week later.

### 8. Tell us what you think

Same **Help & Support** page has a feedback box right below the contact
links. Anything — confusing screen, a feature you wish existed,
something that just feels off. We read every one.

---

## Engineering notes (what's new, what's reused, how it was verified)

### What already existed (Waves 1-8), reused as-is

- **Setup checklist** — the Company Setup Wizard (phase 47) plus the
  founder-assisted white-glove process and its own tracked checklist
  (phase 49, `docs/founder-assisted-migration.md`) already cover this
  end to end, including the hard architectural constraint that the
  client must always be the one to run `/sign-up` (no on-behalf-of
  account creation exists — see that doc's own opening section). The
  "10 steps" section above is this same process, rewritten in the
  pilot's own voice rather than the founder's internal one.
- **Data import** — the CSV importer (phase 48, `docs/company-data-import.md`).
- **Contract template** — contract templates + AI-assisted field
  mapping from an uploaded PDF (roadmap phases 10-11).
- **Owner account** — `create_company_with_owner()`
  (`supabase/migrations/20260718120900_onboarding_function.sql`).
- **PWA install** — the install prompt (phase 44), Chromium's native
  `beforeinstallprompt` plus manual iOS instructions.

### What's new this phase

**Backup contact method** (`/support`, `app/(dashboard)/support/page.tsx`) —
a WhatsApp/email card, driven by `NEXT_PUBLIC_SUPPORT_WHATSAPP`/
`NEXT_PUBLIC_SUPPORT_EMAIL` (`lib/env.ts`, `.env.example`) rather than
hardcoded contact details, so the actual founder/support contact can
change without a code edit. Renders an honest "not configured yet"
message if neither is set, same convention as `isPushConfigured`. No
role gate beyond being signed in — anyone on the team should be able to
reach support, not just an owner/manager.

**Feedback capture** — a new `pilot_feedback` table
(`supabase/migrations/20260817090000_phase63_pilot_feedback.sql`),
following the exact "insert allowed, no SELECT policy for anyone,
read only via a `security definer` function" shape phases 58/59
established for `usage_events`/`operational_events`: any signed-in
company member can submit feedback for their own company
(`is_company_member(company_id)`); nobody, including that same company,
can read it back — only a platform admin, via
`platform_get_company_feedback(p_company_id, p_limit)`, surfaced as a
new "Pilot feedback" card on `/platform/companies/[id]` (right next to
the existing Migration checklist and platform-action history).

**Deliberately NOT the same shape as `trackUsageEvent`/`logOperationalEvent`**:
those two are fire-and-forget telemetry that never throws, by design —
feedback submission is a real, user-initiated action that needs a real
success/error result to show the person who just typed a message, so
`submitFeedback` (`app/(dashboard)/support/actions.ts`) follows this
app's normal mutation convention instead (calls `createClient()`
unconditionally, throws the standard "Supabase is not configured" in
mock mode) — the same shape `recordPayment`/`createExpense` already
use, not a new pattern.

**Nav entry**: "Help & Support" added to `lib/navigation.ts#moreLinks`
(`ALL_ROLES`, unlike most `moreLinks` entries which are
owner/manager-only) with a `LifeBuoy` icon — reachable from both the
desktop sidebar's More page and the mobile bottom nav's More tab.

### Deliberately not built

- **No customer-facing PDF/printable version of the walkthrough above**
  — this doc's own top section is written to be read as-is (copy-paste
  into an email, or read from screen during an onboarding call); a
  separate formatted export was judged unnecessary production for a
  single-pilot stage.
- **No automated NPS/rating scale on the feedback form** — a plain text
  box was judged sufficient for a low-volume, high-context pilot
  relationship; a scored/categorized feedback system is the kind of
  thing worth building once there are enough submissions to need
  triage, not before.
- **No email notification when new feedback arrives** — the founder is
  expected to check `/platform/companies/[id]` periodically during an
  active pilot; a push/email alert on every submission would be
  premature for one or two pilot companies.

### Verification

tsc/eslint/791 tests/build all clean. Live-verified in mock mode:
`/support` renders the WhatsApp/email contact cards (using test env
values) and the feedback form; submitting feedback correctly throws the
same "Supabase is not configured" error every other mutation does in
mock mode (confirmed via the console exception, not just assumed) —
consistent, not a regression. `/platform/companies/pc_atlas` (mock
company) correctly shows the new "Pilot feedback" card with two
realistic mock entries, positioned alongside the existing Migration
checklist and platform-action-history cards.
