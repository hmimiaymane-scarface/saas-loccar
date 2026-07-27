# Security model

## Isolation boundary

Every rental company's data lives in the same Postgres tables, distinguished
by a `company_id` column. **Row Level Security (RLS) is the only thing that
enforces isolation.** The Next.js app, the middleware (`proxy.ts` — this
Next.js version renamed `middleware.ts`), and the navigation are usability
layers on top — none of them are load-bearing for security. If a request
reaches Postgres with a valid but low-privilege session, RLS is what stops
it from touching another company's rows, even if every layer above it were
bypassed or buggy.

## Cross-tenant isolation testing

Roadmap phase 19 added `lib/__tests__/cross-tenant-isolation.test.ts` — a
dedicated suite proving the application-layer query functions behind
`customer_intelligence`, `vehicle_intelligence`, `operations_feed_items`,
`activity_log`, `contract_template_versions`, `getTeamMembers`'s
override-fetch (productization wave 1 phase 3), and `approval_requests`
(until productization wave 1 phase 2 removed its UI) never return
another company's row for a matching entity/customer/vehicle id, even
when seeded side-by-side in the same fake client. This tests
**application-layer discipline** — that every one of these functions
still includes its `company_id` filter — not RLS itself. Not every
phase-01-18 table has a matching TS accessor to test this way:
`role_permission_defaults` is only ever read by the SQL
`has_permission()` function itself (and has no `company_id` to leak
across in the first place — see the table below); `notifications`'
company-scoping is straightforward to audit by inspection but pulls in
enough unrelated machinery (the `has_permission()` RPC, the live-alerts
fan-out) that a matching harness wasn't proportionate to this pass;
`document_extractions` has no bulk-list-by-company reader — every read
is scoped by an already company-gated `document_id`.

**Productization wave 1 phase 5** finally applied every migration to a
real Supabase project and queried its live `pg_class`/`pg_policies`
catalogs directly — the first time RLS itself (not just the
application-layer discipline above) was actually exercised, rather than
audited by reading migration files. It found one real gap this way:
`role_permission_defaults` had RLS disabled entirely, meaning Supabase's
default full-table grants to `anon`/`authenticated` (present on every
table regardless of RLS — see below) were completely unguarded, letting
any caller insert/update/delete/truncate it via the REST API. Fixed in
`20260807090000_fix_role_permission_defaults_rls.sql`: RLS enabled, one
`select`-only policy (`using (true)` — the table has no `company_id`,
so open reads were always fine), no write policy at all. No other public
table had this gap.

**Productization wave 1 phase 6** went one step further than phase 19's
suite (which proves application-layer discipline, not RLS itself — see
its own opening paragraph) and phase 5's catalog inspection (which
confirmed RLS was *enabled*, not that it actually *blocks* anything):
`scripts/phase6-tenant-isolation.ts` creates two real companies, two
real owner users and one real staff user via Supabase Auth on the live
project, seeds one row in every table the phase named — vehicles,
customers, reservations, payments, documents, and contracts (plus the
`contract_templates`/`contract_template_versions` chain contracts
requires) — for Company A, then signs in as each user through the
**anon key**, exactly the path a real request takes (never the
service-role key, which bypasses RLS), and attempts:

- Cross-company **reads**: owner B (Company B) reading each of Company
  A's six rows by id, and staff A (a Company A member) reading Company
  B's vehicle.
- Cross-company **writes**: owner B updating Company A's vehicle,
  deleting Company A's customer, updating Company A's document, and
  inserting a payment with a *forged* `company_id` claiming to belong
  to Company A.
- Positive controls: each user can still read their own company's data
  (proves a false negative — RLS misconfigured to deny everything —
  isn't what a passing run would look like).

All 16 checks passed against the live project: every cross-company read
returned zero rows, every cross-company write affected zero rows or was
rejected outright by RLS, and Company A's data was independently
confirmed unchanged afterward (not just "the write call returned an
error" — the row's actual state was re-checked via the service-role
client). The script tears down every company, membership, and the three
auth.users rows it created in a `finally` block regardless of outcome,
so it leaves no permanent trace on the project and can be re-run safely
any time — `npx tsx scripts/phase6-tenant-isolation.ts` from the repo
root (needs `.env.local`'s real project credentials, which it loads
itself).

## Membership, roles, and suspension

A user gets access to a company through a row in `company_memberships`
(`company_id`, `user_id`, `role`, `status`, `branch_id`). Roles: `owner`,
`manager`, `agent`, `accountant`, `driver`, `cleaner`, `mechanic` (the last
two added in roadmap phase 17 — see `docs/permissions.md` for what changed
and why). Status: `active` or `suspended`. A user may belong to multiple
companies (multiple membership rows) — the schema supports this today even
though the current UI assumes one company per user.

**A suspended membership grants nothing.** The four RLS helper functions
below all filter on `status = 'active'`, so suspension is enforced in
exactly one place and takes effect everywhere at once — no per-feature
"is this user suspended" check to remember. `lib/auth/session.ts` and
`proxy.ts` additionally filter their own membership lookups the same way,
so a suspended user is treated as having no session/company rather than
being let into a dashboard where every real query then fails RLS anyway.

**Membership rows cannot be written by ordinary clients.** There is no
INSERT/UPDATE/DELETE policy on `company_memberships` for the `authenticated`
role. Every write goes through a narrow `SECURITY DEFINER` RPC that
validates the caller's role server-side, never a direct table insert:

- `create_company_with_owner()` — always assigns `auth.uid()` as `owner` of
  a company it just created.
- `invite_member()` — owner/manager only; a manager can never invite
  another `owner` (only an owner can grant ownership); rejects inviting
  someone who already has active access.
- `accept_invitation()` — only usable by the account whose auth email
  matches the invitation's email (checked server-side against
  `auth.users`, never a client-supplied email); single-use (the row's
  `status` flips to `accepted`); rejects expired invitations.
- `update_member_role()`, `suspend_member()`, `reactivate_member()`,
  `remove_member()` — owner/manager only; a manager can never touch an
  `owner`'s membership; nobody can act on their own membership through
  these (no self-promotion, self-suspension, or self-removal); the last
  remaining `owner` can never be demoted, suspended, or removed.

This is what guarantees: a user cannot promote themselves to `owner` of an
existing company, cannot join a company they weren't invited to, cannot
forge someone else's membership, and a company can never be left without
an owner.

## Avoiding RLS recursion

A naive policy on `company_memberships` that queries `company_memberships`
to authorize itself would recurse. Instead, all policies call one of four
helper functions (`supabase/migrations/20260718120700_security_helper_functions.sql`,
redefined in `20260720090500_invitations.sql` to add the `status = 'active'`
check):

- `is_company_member(company_id)`
- `company_role(company_id)`
- `is_company_manager_or_owner(company_id)`
- `is_company_owner(company_id)`

These are `SECURITY DEFINER`, owned by the migration role that also owns
the tables. Postgres does not apply RLS to a table's owner by default, so
the `SELECT` inside each function bypasses RLS entirely instead of
re-entering it — no recursion. Each function also pins
`set search_path = public` so it can't be tricked into resolving an
attacker-controlled object of the same name via a manipulated search path.

The same pattern extends to cross-boundary reads that need to see past the
normal membership check: `get_invitation_preview()` lets a signed-in user
preview an invitation addressed to their own email before they're a member
of that company (matched by their real auth email, never a client-supplied
one), and `get_member_emails()` lets an owner/manager resolve teammates'
emails (not stored on `profiles`) without granting direct access to
`auth.users`.

## Per-table access

**`customers`, `reservations`, `payments`, `expenses`, `maintenance_records`
no longer use a hardcoded role list — see `docs/permissions.md`.** As of
roadmap phase 17, every SELECT/INSERT/UPDATE policy on those five tables
calls `has_permission(company_id, key)` instead of
`company_role(company_id) in (...)`, so "who can read/write what" is a
per-role default (overridable per employee) rather than something fixed in
the RLS source. `docs/permissions.md` has the authoritative, current table;
this file only covers what's unchanged since before that phase:

| Table | Read | Write | Delete |
|---|---|---|---|
| `companies` | members | owner/manager (update only) | — (not exposed) |
| `company_memberships` | own row, or owner/manager of the company | — (RPC only, see above) | — (RPC only) |
| `invitations` | owner/manager, or the invitee previewing their own (via RPC) | — (RPC only) | — |
| `notifications` | own rows only (every row is per-user) | own rows only | — |
| `branches`, `vehicles` | members | owner/manager | owner/manager (branches: owner only) |
| `deposits`, `damages`, `inspections`, `media`, `checklist_template_items` | members | see the handoff-phase migrations (`20260719*`) — same coarse-RLS-plus-fine-action-check pattern | owner/manager where applicable |
| `documents` | `has_permission(company_id, 'download_documents')` (roadmap phase 19 — see "Document security" below) | front-desk roles (`20260719090800_handoff_rls.sql`, untouched by phase 19) | owner/manager |
| `activity_log` | members | any member (insert only) | nobody — append-only |
| `role_permission_defaults` | anyone (no `company_id` — identical for every company, nothing to isolate) | — (manual migration only, never the app) | — |
| `employee_permission_overrides`, `approval_requests` | members | RPC only — see `docs/permissions.md` | — |
| `document_extractions` | members | server-side only (the extraction pipeline itself, phase 03-04) | — |
| `ai_usage_log` | members | server-side only (`askAI()`, phase 05) | — |
| `customer_intelligence`, `vehicle_intelligence` | members | server-side only (recompute jobs, phase 06/08) | — |
| `contract_templates`, `contract_template_versions`, `contracts`, `contract_signatures`, `contract_amendments` | members | see `docs/contract-lifecycle.md` (phase 10-11 — role gates on template/contract mutation, immutable-by-construction versioning) | owner/manager where applicable |
| `operations_feed_items` | members | server-side only (the cron-driven observer job, phase 12 — see `lib/supabase/admin.ts`) | — |
| `webauthn_credentials` | own rows only (no company-wide visibility for a personal biometric credential, phase 16) | own rows only, via the WebAuthn routes | own rows only |

All ten of the above (phases 03-16) were confirmed to have RLS enabled during this phase 19 hardening pass — none had ever been added to this table before, purely a documentation lag, not an isolation gap.

DELETE on `customers`/`reservations`/`payments`/`expenses`/`maintenance_records`
is unchanged: still `is_company_manager_or_owner(company_id)` directly, not
routed through `has_permission()` — deletion of core records stays a
stable owner/manager invariant, not something made per-employee overridable
in this phase.

**`expenses` INSERT is intentionally wider than UPDATE/DELETE.** RLS
allows `agent` to *record* an expense (whether that's actually offered in
the UI depends on the company's `agents_can_record_expenses` setting,
checked in `app/(dashboard)/expenses/actions.ts` — the same "coarse RLS,
fine action-layer check" split used elsewhere), but *editing* or
*attaching a receipt to* an existing expense stays limited to
owner/manager/accountant. The action-layer role checks for update/attach
were deliberately kept in sync with this narrower RLS grant — using the
wider "can record" check for an update would let the action report
success while Postgres silently updates zero rows.

Every INSERT/UPDATE policy re-checks `company_id` in its `WITH CHECK`
clause against the same helper functions, and the handoff- and
owner-operating-system-phase policies additionally re-check that any
other id on the row (`vehicle_id`, `reservation_id`, `maintenance_record_id`,
...) actually belongs to the same company — never trusting a
client-supplied foreign key at face value. That's what stops a member of
company A from writing a row — or retargeting an existing row via UPDATE —
to claim `company_id = B`, or to attach company A's expense to company B's
vehicle.

## Live alerts vs. stored notifications

Most of the "needs attention" list (overdue rentals, maintenance due,
expiring documents, ...) is recomputed fresh on every request from current
data (`lib/data.ts`'s `getLiveAlerts`) — there is no row to secure beyond
the normal per-table RLS above, because there is no row. The
`notifications` table only stores two things, both scoped strictly
per-user: genuine one-off events (e.g. a damage was recorded) and a
per-user "I've seen this" dismissal marker for a live alert. Every row's
`user_id` is checked against `auth.uid()`, so one person's dismissal or
event feed is never visible to (or editable by) another.

## What the app layer adds on top

- `proxy.ts` redirects unauthenticated requests to `/sign-in` and gates
  dashboard routes behind having at least one *active* company membership
  (redirecting to `/onboarding` otherwise) — except `/invite/*`, which an
  authenticated user with no company yet must be able to reach to accept
  an invitation without being forced through "create a company" first.
  This is for UX flow, not security — RLS holds even if this redirect is
  skipped.
- `lib/auth/session.ts` centralizes "who is the user, what's their current
  company, what's their role" so pages don't each re-derive it, and is
  itself filtered to active memberships only.
- `lib/navigation.ts` filters visible nav items by role so people aren't
  shown sections they can't act on. Hiding a link is not access control;
  the database policies above are.
- CSV export routes (`app/api/exports/*`) re-derive the session and role
  server-side exactly like a mutating server action would, and reuse the
  same filtered `lib/data.ts` query functions the corresponding list page
  uses — an export can never see more than the page it's exported from.

## Platform-owner (SaaS admin) boundary

A second, entirely separate authorization tier sits above every tenant
company: `platform_admins` (see
`supabase/migrations/20260721090000_platform_admins.sql`). A tenant
`owner`/`manager` role grants nothing here — the two are unrelated.

- `platform_admins` has row level security enabled with **zero
  policies**, meaning no role can read or write it directly, not even
  the user who owns a given row. The only way in is
  `is_platform_admin()`, a `SECURITY DEFINER` function that bypasses RLS
  by running as the table owner. Platform-admin status can only be
  granted by a direct database write as the migration/service role — see
  `docs/supabase.md` §4b. No app code path can self-assign or grant it.
- `company_subscriptions` (manual trial/active/suspended/cancelled
  status, plan, price, internal notes) has a SELECT policy scoped to
  `is_platform_admin()` and no INSERT/UPDATE/DELETE policy at all —
  every mutation goes through one of the `platform_*` `SECURITY DEFINER`
  functions in `20260721090300_platform_mutations.sql`, each of which
  re-checks `is_platform_admin()` itself and writes an audit row via
  `log_platform_action()`.
- Tenant code never queries `company_subscriptions` directly. The one
  fact a tenant's own session needs — "is my company suspended?" — is
  exposed through `is_company_suspended(company_id)`, a narrow boolean
  function, not table access. `lib/supabase/middleware.ts` calls it to
  redirect a suspended company's users to `/account-suspended`; their
  membership rows, and all of their operational data, are untouched.
- Every platform dashboard read (`platform_get_overview`,
  `platform_list_companies`, `platform_get_company_summary`,
  `platform_get_company_events`) is a narrow, purpose-built function
  that returns only aggregate counts and the specific summary fields the
  dashboard needs — never raw customer records, documents, licences,
  contracts, or a tenant's full `activity_log`. Platform admins do not
  gain a general escape hatch around tenant RLS; they gain exactly these
  functions.
- `platform_audit_log` is separate from the tenant-facing `activity_log`
  on purpose, and is likewise SELECT-restricted to platform admins with
  no direct write policy.

## AI assistant boundary

The assistant (`app/(dashboard)/ai-assistant`) adds no new privilege on
top of everything above — it is a client of the same session, the same
RLS, and the same server actions as the rest of the app.

- Every "write" tool (`propose_create_reservation`, `propose_record_payment`,
  `propose_cancel_reservation`, `propose_schedule_maintenance`) only ever
  inserts a row into `ai_proposed_actions` — it never touches an
  operational table. Nothing changes until a human clicks Confirm.
- Confirming a proposal calls the exact same server action a human
  clicking the equivalent button elsewhere in the app would call
  (`createReservation`, `recordPayment`, `updateReservationStatus`,
  `createMaintenance`), with the exact same `requireSession()`/
  `requireRole()` checks. A role that couldn't create a reservation by
  hand can't do it by confirming an AI proposal either — the confirm
  step routes through the same gate, not around it.
- Every "read" tool runs on the current user's own session-bound
  Supabase client, so RLS scopes results exactly as it would for any
  other page — a tool call can never see another company's data. As of
  roadmap phase 17, financial fields on `find_reservation`/
  `get_customer_history` and the payment/reservation/maintenance
  proposal tools are also gated by `has_permission()` (see
  `docs/permissions.md`) — before that phase this file's claim that a
  tool call "never sees more than the signed-in user's role already
  permits" was aspirational, not actually enforced: `lib/ai/tools.ts`
  had no role or permission checks of its own at all.
- `ai_conversations`/`ai_messages`/`ai_proposed_actions` are private to
  the user having the conversation (owner/manager get read-only
  oversight, matching the rest of the app's "coarse RLS" pattern) — see
  `supabase/migrations/20260722090000_ai_assistant.sql`.
- The system prompt explicitly instructs the model to treat any
  customer-supplied text (names, notes) as data, never as instructions —
  defense in depth on top of the structural fact that a prompt-injected
  tool call still can't do anything without a human confirming it.
- A simple per-user rate limit (12 messages/minute) on the chat route
  guards against a runaway loop or accidental resubmission storm; no
  external rate-limit service is used.

## Document security

Roadmap phase 19 (bible Chapter 14 §9/§10/§12, Chapter 7 §15) audited
the document-intelligence pipeline (phases 03-04) and the storage layer
end to end. Three real gaps found and fixed:

- **Upload validation was 100% client-side.** `lib/storage.ts#validateFile()`
  existed and was real, but every one of its call sites was a client
  component — the server actions that persist the resulting DB row
  (`createDocumentRecord`, `attachInspectionMedia`, `attachDamageMedia`)
  accepted `mimeType`/`fileSizeBytes` as plain client-supplied strings
  with zero re-validation. All three now call
  `lib/storage.ts#validateUploadForCompany()` (also re-checks the
  storage path's company prefix) before persisting anything. **Honest
  limitation**: this validates *metadata*, not the actual uploaded
  bytes — uploads go directly browser → Supabase Storage, so a server
  action never sees the file itself, only what the client reports about
  it. Real content-sniffing would mean routing uploads through a
  server-side proxy or a Storage webhook — a materially larger
  architecture change than this hardening pass's scope.
- **Documents had zero access logging**, unlike contracts
  (`contract_viewed`/`printed`/`downloaded`, phase 11). Every document
  view/download now logs a `document_viewed`/`document_downloaded`
  event (`app/(dashboard)/documents/actions.ts#logDocumentAccess`,
  client-triggered since a document has no detail page of its own to
  log from server-side render the way a contract does).
- **`download_documents` was a dead permission key.** Phase 17 seeded it
  into `role_permission_defaults` but nothing ever called
  `has_permission(..., 'download_documents')` anywhere — the `documents`
  table's SELECT policy was untouched by phase 17's own RLS rewrite and
  stayed plain `is_company_member(company_id)`, meaning cleaner/mechanic
  could read every customer's identity documents despite phase 17
  deliberately keeping those two roles out of customer/financial data
  everywhere else. Now wired into the real SELECT policy; role defaults
  re-seeded so owner/manager/agent/accountant/driver keep the access
  they already had, and cleaner/mechanic correctly don't — a deliberate
  tightening for those two roles, not a preservation-only change.

**Masked/redacted previews were evaluated and explicitly declined this
pass**, per the phase brief's own escape hatch ("if too large a lift,
at minimum log + permission-check"). A CSS-only blur-until-clicked
would be security theater: the full-resolution image is already fully
downloaded to the browser via the signed URL by the time any blur
renders, trivially bypassed via dev tools. Real masking needs
server-side image processing — redacting regions before the client ever
receives bytes — a materially larger lift than this pass's scope.

**Productization wave 1 phase 7** validated the whole pipeline against
the real Storage bucket and the real linked Postgres project for the
first time — real uploads of every named document type (CIN/passport
as `identity_document`, driving licence, vehicle registration, contract
file) through a real signed-in session, then deliberate attacks:
oversized files, disallowed types, a simulated broken upload (crash
between the Storage write and the `documents` row insert), a retry,
delete/archive behavior, a permission downgrade, and cross-tenant reads
— both at the table level and directly against Storage
(`scripts/phase7-document-pipeline.ts`). Three more real gaps found and
fixed this way:

1. **`grant_permission_override()`/`revoke_permission_override()` (phase
   17) have been failing outright since phase 5 applied the
   migration.** Their `activity_log` insert uses two event types
   (`permission_override_granted`/`_revoked`) that were never added to
   any version of `activity_log_type_check` — an omission in phase 17's
   own migration, not something a later one broke. Every Staff
   access-switch flip (phase 3) has been silently failing against the
   real database the whole time this table existed with real
   migrations applied. Fixed in
   `20260807090200_fix_activity_log_permission_override_types.sql`,
   plus the matching `types/rental.ts#ACTIVITY_TYPES` and
   `activity-feed-card.tsx` icon-map additions.
2. **`storage.objects`' read policy only checked company membership,
   never `download_documents`** — the same permission the `documents`
   table's own SELECT policy enforces (see the phase 19 finding above).
   A Staff member with that switch off correctly lost the ability to
   see a `documents` row, but could still fetch the exact file directly
   from Storage by path. Fixed in
   `20260807090300_fix_storage_document_permission_gate.sql`, scoped
   narrowly to paths whose second segment is literally `documents` (the
   convention `new-document-form.tsx`/`document-upload-row.tsx` use) —
   every other upload path (damage photos, contract PDFs, receipts,
   customer-onboarding scans) keeps the unchanged membership-only gate,
   since `download_documents` was never meant to cover those.
3. **The `company-files` bucket had no `file_size_limit` or
   `allowed_mime_types` configured** — confirmed live (`null`/`null`).
   `lib/storage.ts`'s 15MB cap and mime allowlist were only ever
   enforced in browser JS and in a server action's re-check of
   client-*reported* metadata — never by Storage itself, so a direct
   API call bypassing the app's own JS entirely could upload anything.
   Fixed in `20260807090400_fix_storage_bucket_limits.sql` to match
   `lib/storage.ts` exactly.

All 20 checks in the script pass after the three fixes; it tears down
every company, user, document row, and Storage object it creates
regardless of outcome.

**Known limitations, found but deliberately not fixed this phase** (a
real architecture change, not proportionate to a verification pass):

- **Upload is two separate steps, not one transaction.** The browser
  uploads straight to Storage, then a second, independent call
  (`createDocumentRecord`) records the DB row. A failure between them
  (confirmed live) leaves a real orphaned Storage object with no DB
  row — invisible to the UI, never cleaned up.
- **No retry logic exists in the desktop upload path**
  (`new-document-form.tsx`) — a failed upload requires re-picking the
  file from scratch. The mobile offline-sync engine's `idempotencyKey`
  (`lib/offline/sync.ts`) is a separate mechanism wired only into the
  pickup/return wizards.

## Secrets & encryption

**Secrets audit (roadmap phase 19), clean**: `.env.example` holds only
blank placeholders; `.env.local` is gitignored and was never committed
in this repo's history (`git log --all --diff-filter=A -- "*.env*"`
returns only `.env.example` itself); a repo-wide grep for key-shaped
literals (`sk-`/`re_`-style prefixes, `_KEY=`/`_SECRET=`/`_TOKEN=`
literal assignments) found no real credential anywhere in tracked
source — every API key/credential (`OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) is read
through `process.env` via `lib/env.ts`, never hardcoded.

**Encryption**: this app has no application-level encryption of its own
to extend, and doesn't need one — sensitive data (extracted OCR
identity fields, signature records, contract PDFs) rides entirely on
Supabase's platform-level protection: TLS in transit for every
connection, encryption at rest for both Postgres and Storage, managed
by the platform rather than this codebase. There is no second,
app-level copy or mechanism to reconcile against this — inventing one
would be redundant, not more secure.

## Known limitations (intentional, for a future phase)

- No per-branch access restriction (e.g. an agent scoped to one branch) —
  a membership can *record* which branch someone belongs to
  (`company_memberships.branch_id`), but nothing yet enforces it at the
  RLS level; access is company-wide once a role permits an action. Most
  target companies have exactly one branch, so this is deferred rather
  than solved partially.
- `driver`, `cleaner`, and `mechanic` have no general write path — each
  is scoped to its own assigned-or-unassigned operational rows (see
  `docs/permissions.md`), not company-wide reads/writes the way
  owner/manager/agent/accountant are.
- An agent who records an expense (when their company allows it) cannot
  attach a receipt to it or edit it afterward — see the `expenses` section
  above. They can still view the expense they created.
- Deposit "retained" amounts and "currently held" totals shown in reports
  are always a current snapshot, never reconstructed as of a past date —
  see `lib/reports.ts`'s module comment for why (no historical balance
  snapshots yet, on purpose).
- **The mobile PWA's idle timeout is client-side only** (`hooks/use-idle-redirect.ts`,
  30 minutes, standalone-display-mode only — it correctly never fires
  for a plain desktop or mobile-browser-tab session). It redirects to
  sign-in; it does not revoke the underlying Supabase session
  server-side (the hook's own comment says as much). A stolen or
  unattended device's session cookie remains technically valid until
  its natural Supabase expiry, not until the idle redirect fires.
- **`lib/supabase/admin.ts`'s service-role client is scoped by convention,
  not by code.** Its doc comment names the two allowed callers (the
  operations-feed cron job, WebAuthn's `authenticate-verify`) but
  nothing in the type system stops a third caller from importing
  `createAdminClient()` — it bypasses RLS entirely for whoever calls it.
  Confirmed (roadmap phase 19) that both existing callers use it
  narrowly and correctly; this is a real architectural trust boundary
  worth knowing about before adding a third caller casually.
- WebAuthn `register-verify` has no rate-limiting (only
  `authenticate-verify` does, added roadmap phase 19) — it already
  requires an authenticated session, a fundamentally lower-risk surface
  with no "guess whose credential this is" attack the way an
  unauthenticated sign-in attempt has.
