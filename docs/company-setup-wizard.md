# Company Setup Wizard

Roadmap phase 47, first phase of Wave 7 ("Switching, Setup, and
Customer Acquisition Readiness"). Goal per the phase brief: "a new
agency can reach a usable dashboard without technical assistance."
Replaces the old single-screen `OnboardingForm`
(`app/onboarding/page.tsx`) with a 5-step wizard
(`components/onboarding/onboarding-wizard.tsx`): Company → Logo →
Defaults → Contract → Team.

## Schema additions

`supabase/migrations/20260812090000_phase47_company_setup_wizard.sql`
adds two columns to `companies`:

- `default_deposit_mad numeric` — prefills the expected deposit amount
  on new reservations (see "Default deposit" below).
- `overdue_grace_period_hours integer not null default 0`, checked
  `0..168` — see "Overdue grace period" below.

`logo_path`, `email`, and `address` already existed as dormant columns
on `companies` since the original migration — this phase is their
first real reader/writer code, not a schema change. All five fields
were added to `RentalCompany` (`types/rental.ts`), the session mapping
(`lib/auth/session.ts`, including a signed URL for `logoUrl` using the
same 1-hour-expiry pattern as contract PDFs), and the mock company
fixture (`lib/mock/company.ts`).

## Why a multi-step wizard, not a smarter form

Same shared pieces as every other stepped flow in this app
(`WizardProgress`, per-step sub-components, local `step` state) — see
`docs/customer-onboarding.md` and `docs/new-rental-wizard.md` for the
established pattern this phase reuses rather than reinvents.

## The company-creation boundary

Only step 1 (name/city/phone/currency/language) runs before a real
company exists, via the unchanged `create_company_with_owner()` RPC
(`supabase/migrations/20260718120900_onboarding_function.sql`) —
its SECURITY DEFINER logic was deliberately left untouched rather than
extended to accept the new fields, since every later step can now
operate on the now-real company through ordinary
`requireSession()`-gated actions (`app/onboarding/actions.ts`): the
caller is a real `owner` member by then, so RLS permits it without any
privileged path. This also makes a mid-wizard page refresh safe —
the company already exists, so no data is lost — though not fully
resumable: a refresh re-shows step 1 rather than the exact step the
user was on, an accepted trade-off rather than an oversight.

## The invite step's link

`inviteMember` (`app/(dashboard)/employees/actions.ts`) already called
the `invite_member` RPC, which already returned a `token` — every
existing caller just discarded it. `TeamActionState` gained an
optional `token` field so the wizard's final step can show a
"copy invite link" UI immediately, since this app has no email-sending
of any kind (see the invitations UI's own "Copy link" pattern) and
would otherwise leave a freshly-invited teammate with no way to accept.

## Overdue grace period — a deliberate scope boundary

`overdueGracePeriodHours` only affects **actionable overdue signals**:
`getLiveAlerts`'s DB-backed overdue query (`lib/data.ts`) and the push
reminder cron/dev-trigger (`lib/notifications/reminders.ts`) now use
`return_at < (now - overdueGracePeriodHours)` instead of a strict `now`
cutoff.

It deliberately does **not** change `Booking.isOverdue`, the boolean
that drives the "Overdue" badge in the reservation list, calendar, and
CSV export (`lib/data.ts`'s `mapReservationRow`) — that stays a strict
"past return time" fact. The reasoning: a grace period is about when to
*bother someone* about lateness, not about what actually happened. The
badge is informational status; the alert/push is the actionable
threshold. Blurring the two would mean either the badge lies for the
duration of the grace period, or the grace period stops meaning
anything for staff who only look at badges.

Mock mode's `isOverdue` values (`lib/mock/bookings.ts`) are hand-baked
booleans with no hour-precision return timestamp behind them, so mock
mode can't honor an hour-level grace period even for alerts — moot in
practice, since the mock company's own default is 0 hours.

## Default deposit

`DepositPanel`'s "Set expected" (`components/domain/reservations/
deposit-panel.tsx`) now prefills the amount input with the company's
`defaultDepositMad` — but only when the reservation has no expected
deposit yet (`!deposit?.expectedMad`). Editing an existing expected
amount is untouched; the prefill only ever applies to a reservation
being initialized for the first time.

## Settings: closing the loop

The wizard's own copy says "you can refine everything later in
Settings." Before this phase, `company-settings-form.tsx` exposed only
4 unrelated fields (maintenance/document reminder thresholds, the
agent-expense toggle, muted notification types) — currency was shown
read-only, and there was no field at all for email, address, deposit,
or grace period. This phase extended `CompanySettingsForm` and
`updateCompanySettings` (`app/(dashboard)/settings/actions.ts`) to add
all four, and made currency actually editable, so the wizard's own
promise holds true for every field it collects. Company name and logo
still have no edit UI in Settings — out of this phase's stated scope,
same as before.

## Known limitations

- **Mock mode can't exercise the wizard at all.** `/onboarding`
  redirects straight to `/overview` when Supabase isn't configured
  (no auth, no company to create, no RPC to call against) — this
  predates the phase and wasn't changed. Every other touched surface
  (Settings' new fields, the deposit prefill, the logo fallback in
  `CompanyIdentity`) **was** verified live in mock mode, in both light
  and dark themes.
- **Currency is stored, not threaded through formatting.**
  `companies.currency` now flows through the session and is editable
  in Settings, but `lib/format.ts`'s `formatMad()` still hardcodes
  `"MAD"` regardless of the company's actual currency. Making currency
  affect real formatting throughout the app is a materially larger,
  separate task — this phase only captures the preference.
- **No edit path for company name or logo in Settings** (see above).
