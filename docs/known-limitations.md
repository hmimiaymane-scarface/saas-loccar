# Known Limitations

Roadmap phase 70 ("Paid-Customer Readiness") — "known limitations
documented," one of 10 named requirements for "reach the point where
charging is responsible." Every item below was already found, verified,
and documented individually across earlier phases, scattered across
roughly 20 separate `docs/*.md` files with no single place a business
owner deciding whether to start charging real customers could read the
whole list at once. This page is that single place — nothing here is a
new finding, only a consolidation, with a pointer back to where each
was originally established.

## The one active blocker

**5 database migrations have never been applied to the live project**
(`usage_events`, `operational_events`, `pilot_feedback`,
`product_signals`, and phase 66's launch-gate extensions). Until this
is resolved: the in-app feedback form, and every founder-facing
analytics/operations/product-signals/launch-gate page, are
non-functional against real data. Everything else in this document is
a smaller, already-scoped gap; this one is the actual reason "charging
is responsible" isn't fully true yet. See
`docs/paid-customer-readiness.md` and `/platform/launch-gate`'s
"Paid-Customer Readiness" section for current status.

## Missing features (not bugs — nothing here is broken, it simply doesn't exist yet)

- **No rental extension or vehicle exchange flow.** There is no
  supported way to extend an active rental's return date or swap its
  vehicle mid-rental (`rental_extended` has been reserved-but-never-
  emitted `activity_log` vocabulary since the very first phase). See
  `docs/rental-scenario-test-suite.md` scenarios 8-9.
- **No on-behalf-of account creation or impersonation** anywhere in
  the app — a platform admin cannot act as a company user, and there's
  no assisted-signup flow for a non-technical owner. See
  `docs/pilot-onboarding-package.md`.
- **XLSX import isn't supported, only CSV.** Every mainstream
  spreadsheet tool exports to CSV trivially; adding real `.xlsx`
  binary parsing was judged not worth the dependency and its security
  review burden. Stated plainly in the import wizard's own copy. See
  `docs/company-data-import.md`.
- **Import only covers vehicles and customers**, not existing active
  reservations or historical rental records, and never assigns a
  branch to an imported vehicle (always lands unassigned, fixable
  afterward on the Fleet edit page). See `docs/company-data-import.md`.
- **No per-branch access restriction.** A membership can record which
  branch someone belongs to, but nothing enforces it at the RLS level
  yet — access is company-wide once a role permits an action. Most
  target companies have exactly one branch. See `docs/security.md`.
- **No NPS/rating scale on pilot feedback**, no PDF export of the
  onboarding walkthrough, and no email/push alert when new feedback
  arrives. See `docs/pilot-onboarding-package.md`.
- **No automated behavior/anomaly detection, generic page-view
  tracking, or cross-signal trend dashboard** on top of the product
  signals founders log by hand. See `docs/pilot-feedback-loop.md`.

## Known technical limitations

- **`driver`, `cleaner`, and `mechanic` have no general write path** —
  each is scoped to its own assigned-or-unassigned operational rows,
  by design, not company-wide reads/writes the way owner/manager/
  agent/accountant are. See `docs/permissions.md`.
- **An agent who records an expense cannot attach a receipt to it or
  edit it afterward** — they can still view what they created. See
  `docs/security.md`.
- **Deposit "retained"/"currently held" totals are always a current
  snapshot**, never reconstructed as of a past date — no historical
  balance snapshots exist yet, on purpose. See `lib/reports.ts`.
- **The mobile PWA's idle timeout is client-side only** (30 minutes,
  standalone-display-mode only). It redirects to sign-in; it does not
  revoke the underlying Supabase session server-side. A stolen or
  unattended device's session cookie remains technically valid until
  its natural expiry, not until the idle redirect fires. See
  `docs/security.md`.
- **The service-role Storage/Postgres client is scoped by convention,
  not by the type system** — its own doc comment names the two
  allowed callers, but nothing stops a third caller from importing it
  and bypassing RLS entirely. Confirmed both existing callers use it
  narrowly and correctly. See `docs/security.md`.
- **WebAuthn's `register-verify` has no rate limiting** (only
  `authenticate-verify` does) — a lower-risk surface since it already
  requires an authenticated session. See `docs/security.md`.
- **A locale/date-formatting inconsistency** exists across a few
  report-adjacent files — cosmetic, nothing renders incorrectly or
  crashes. See `docs/pilot-release-candidate.md`.
- **Raw error messages can flow unredacted into platform-admin-only
  observability tables** — low severity, founder-only exposure, never
  seen by a company's own users. See `docs/security-revalidation-phase60.md`.
- **A failed browser document upload still requires re-picking the
  file** rather than an automatic retry — the mobile offline-sync
  engine has its own separate idempotency mechanism, wired only into
  the pickup/return wizards, not the desktop upload form. See
  `docs/security.md`.
- **No off-platform backup of Storage bucket contents** — Supabase's
  own managed backups cover the database but not Storage object
  bytes, deployment secrets, or this repo's own migration history. See
  `docs/backup-and-restore.md`.
- **Contract PDFs use a non-bidi text-layout architecture** — a
  cosmetic, non-crashing limitation for right-to-left content. See
  `docs/rtl-readiness-audit.md`.

## Testing gaps

- **No physical Android, iPhone, weak-network, or offline-recovery
  testing has ever been executed** — the single most recurring open
  item across this entire roadmap. Concrete, executable test plans
  exist (`docs/phase-36-device-test-matrix.md`,
  `docs/phase-37-iphone-test-matrix.md`) but no physical device or
  real network-throttling exists in this development environment. The
  underlying mechanics (offline queue, slow-network UI states) are
  built and unit-tested, just never exercised against real hardware.
  See `docs/launch-reliability-gate.md`.

## Deliberately not built

- **A named roadmap phase was intentionally left as a stub** rather
  than fully implemented, per an explicit scope decision at the time —
  the reserved spot exists, the feature doesn't.
