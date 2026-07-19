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

## Membership, roles, and suspension

A user gets access to a company through a row in `company_memberships`
(`company_id`, `user_id`, `role`, `status`, `branch_id`). Roles: `owner`,
`manager`, `agent`, `accountant`, `driver`. Status: `active` or
`suspended`. A user may belong to multiple companies (multiple membership
rows) — the schema supports this today even though the current UI assumes
one company per user.

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

| Table | Read | Write | Delete |
|---|---|---|---|
| `companies` | members | owner/manager (update only) | — (not exposed) |
| `company_memberships` | own row, or owner/manager of the company | — (RPC only, see above) | — (RPC only) |
| `invitations` | owner/manager, or the invitee previewing their own (via RPC) | — (RPC only) | — |
| `notifications` | own rows only (every row is per-user) | own rows only | — |
| `branches`, `vehicles`, `maintenance_records` | members | owner/manager | owner/manager (branches: owner only) |
| `customers`, `reservations` | members | owner/manager/agent | owner/manager |
| `payments` | members | owner/manager/agent/accountant | owner/manager |
| `expenses` | members | owner/manager/accountant/agent (insert only — see below) | owner/manager |
| `deposits`, `documents`, `damages`, `inspections`, `media`, `checklist_template_items` | members | see the handoff-phase migrations (`20260719*`) — same coarse-RLS-plus-fine-action-check pattern | owner/manager where applicable |
| `activity_log` | members | any member (insert only) | nobody — append-only |

`driver` is read-only across every table in this phase.

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
  other page — a tool call can never see another company's data, and
  never sees more than the signed-in user's role already permits.
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

## Known limitations (intentional, for a future phase)

- No per-branch access restriction (e.g. an agent scoped to one branch) —
  a membership can *record* which branch someone belongs to
  (`company_memberships.branch_id`), but nothing yet enforces it at the
  RLS level; access is company-wide once a role permits an action. Most
  target companies have exactly one branch, so this is deferred rather
  than solved partially.
- `driver` has no write path yet, by design.
- An agent who records an expense (when their company allows it) cannot
  attach a receipt to it or edit it afterward — see the `expenses` section
  above. They can still view the expense they created.
- Deposit "retained" amounts and "currently held" totals shown in reports
  are always a current snapshot, never reconstructed as of a past date —
  see `lib/reports.ts`'s module comment for why (no historical balance
  snapshots yet, on purpose).
