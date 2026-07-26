# Role-Specific Field Views & Granular Permission Engine

Roadmap phase 17. Closes a gap that turned out to be bigger than "add two
mobile roles": every SELECT policy in `row_level_security.sql` on
`customers`, `reservations`, `payments`, `expenses`, and
`maintenance_records` checked only `is_company_member(company_id)` — never
role. Writes were role-gated; reads were not. Concretely, before this
phase any employee — including `driver`, which the UI treated as
read-only-and-otherwise-unrestricted — could read every customer, payment,
and reservation in the company. `cleaner` and `mechanic` would have
inherited that same over-exposure if the read-side gap had been left in
place and only new UI added on top.

## The permission engine

Three new pieces replace the hardcoded `company_role(company_id) in
(...)` lists this app used everywhere before:

- **`lib/permissions/catalog.ts`** — a fixed, hand-maintained list of
  permission keys (same "closed catalog" convention as
  `lib/contracts/variables.ts`'s `CONTRACT_VARIABLE_CATALOG`). Every key
  here is one `has_permission()` actually resolves and at least one RLS
  policy or server action actually checks.
- **`role_permission_defaults(role, permission_key, allowed)`** — the
  per-role fallback. Seeded to reproduce today's actual RLS behavior
  exactly for `owner`/`manager`/`agent`/`accountant` (see the table
  below — each row is cross-referenced against the pre-phase-17 policy
  it mirrors). `driver`'s unrestricted read access was **not**
  preserved — that was always the gap this phase exists to close, not a
  behavior worth keeping. `cleaner`/`mechanic` get minimal,
  operational-scope-only defaults.
- **`employee_permission_overrides(company_id, user_id, permission_key,
  allowed, granted_by, reason, expires_at, created_at)`** — per-employee
  grant or revoke, written only via `grant_permission_override()` /
  `revoke_permission_override()` (owner/manager-only SECURITY DEFINER
  RPCs, same guard shape as `update_member_role()`). A non-null
  `expires_at` in the future is a time-boxed elevation; `null` is
  permanent. No cron job — expiry is checked lazily, at read time.

`public.has_permission(company_id, key)` is the primitive everything
else calls: a non-expired override wins if one exists, otherwise the
caller's role default, otherwise `false`. Same `SECURITY DEFINER` /
`stable` / `search_path`-pinned style as `is_company_member`/
`company_role` (see `docs/security.md`). `lib/permissions/resolve.ts` is
a pure TypeScript mirror of the same precedence rule, for UI-side
pre-checks and unit tests (`lib/permissions/__tests__/resolve.test.ts`)
— the database is still what actually enforces it.

### Role defaults (what each role gets without an override)

| Permission key | owner/manager | agent | accountant | driver | cleaner | mechanic |
|---|---|---|---|---|---|---|
| `view_customers`, `view_reservations`, `view_financial_reports` | ✓ | ✓ | ✓ | — | — | — |
| `edit_customers`, `edit_reservations` | ✓ | ✓ | — | — | — | — |
| `record_payments` | ✓ | — | ✓ | — | — | — |
| `manage_vehicles` | ✓ | — | — | — | — | — |
| `manage_maintenance` | ✓ | — | — | — | — | ✓ (scoped) |
| `manage_cleaning_tasks` | ✓ | — | — | — | ✓ (scoped) | — |
| `view_assigned_deliveries` | — | — | — | ✓ | — | — |
| `download_documents` | ✓ | ✓ | ✓ | ✓ | — | — |
| `approve_refunds`, `generate_contracts`, `approve_contracts`, `manage_employees`, `configure_integrations` | ✓ | — | — | — | — | — |

`download_documents` was seeded owner/manager-only when this table was
first written (no RLS precedent existed yet to preserve — see the
paragraph below). Roadmap phase 19 actually wired it into the
`documents` table's SELECT policy and re-seeded it to match what was
already true for every role except cleaner/mechanic — see
`docs/security.md`'s "Document security" section.

"Scoped" means the RLS policy additionally restricts to rows where
`assigned_employee_id` is null (unassigned, visible to anyone with the
permission) or equals the caller — see below.

## New roles: cleaner, mechanic

Added to `EmployeeRole`, the `company_memberships`/`invitations` role
CHECK constraints, `lib/roles.ts`, `lib/navigation.ts`'s `ALL_ROLES`, and
every place that validates an invited/changed role
(`invite_member`/`update_member_role` RPCs and their TS call sites).
`maintenance_records` gained an `assigned_employee_id` column (mirrors
`reservations.assigned_employee_id` from phase 16 exactly — nullable,
`on delete set null`, an unassigned record stays visible to any
`manage_maintenance`/`manage_cleaning_tasks` holder). `'cleaning'` was
already a valid `maintenance_records.type` value (added by
`20260720090000_maintenance_upgrade.sql`, before this phase) — no schema
change needed there.

## RLS rewrite

SELECT **and** INSERT/UPDATE on `customers`/`reservations`/`payments`/
`expenses`/`maintenance_records` now call `has_permission()` — not just
reads. Restricting the change to SELECT would have left overrides
read-only in practice (e.g. temporarily letting one agent approve a
refund would do nothing, since the write path would still check a
hardcoded role list). DELETE on all five tables is unchanged — still
`is_company_manager_or_owner(company_id)` directly. Deletion of core
records stays a stable owner/manager invariant this phase does not make
per-employee overridable; keeping it off the permission engine also
means the catalog doesn't need `delete_customers`/`delete_vehicles`-style
keys that would just always resolve the same way delete already does.

`customers`/`reservations` SELECT has one extra clause beyond the plain
permission check: a caller holding `view_assigned_deliveries` (driver)
can always see a reservation assigned to them (and, through it, that
reservation's customer), even without the general `view_reservations`/
`view_customers` grant. This is what gives driver row-scoped visibility
instead of "no visibility at all."

## Sensitive operations

`components/domain/shared/sensitive-action-confirm-dialog.tsx` is a
shared confirm-with-required-reason dialog (modeled on the one place
this pattern already existed — `ContractLifecycleActions`' cancel-contract
dialog — generalized so every sensitive action reuses it instead of
each re-implementing the textarea + pending/error state). Wired into:

- Blocking a customer (`setCustomerStatus(id, "blocked", reason)`) — the
  existing `customers.status` "blocked" value *is* the blacklist
  concept; no new columns were added. The reason is required
  server-side, not just in the UI, and recorded in `activity_log`.
- Returning a deposit (`returnDeposit`) — reason is now required, same
  as `retainDeposit` already required.

Deleting a customer/vehicle or removing an inspection are **not** wired
up: none exist as server actions today (only the DB-level DELETE policy
does), and building three new delete flows from scratch — with real
FK-cascade implications, e.g. `reservations.customer_id` is `on delete
restrict` — is a different, larger piece of work than adding a
confirmation dialog to something that already exists. Contract
amendments (`createAmendmentAction`) already required a `description`
before this phase and needed no change.

## Generic approval workflow

`approval_requests(company_id, type, entity_type, entity_id, requested_by,
payload, status, reason, reviewed_by, reviewed_at, created_at)` — one
`type`-discriminated table for every "employee proposes, owner/manager
reviews" flow (`large_discount`, `refund`, `contract_amendment`,
`vehicle_exchange`, `blacklist_customer`). `create_approval_request()` is
open to any active member (no role gate of its own — `has_permission()`
already decided whether someone could act directly, without asking).
`resolve_approval_request()` is owner/manager-gated and, on approval,
**performs the side effect itself** per `type`.

This deliberately does not reuse the AI assistant's propose→confirm
shape (`ai_proposed_actions` → `confirmProposedAction`), even though it
looks similar. `confirmProposedAction` works by replaying a stored
payload through the exact real server action a human would call, which
re-checks permission via `requireRole()` — the proposal step itself adds
no privilege. An approval requester is the opposite case: they lack the
permission to do the thing themselves by definition (that's why they're
requesting), so replaying through their own action would just fail their
own check. `resolve_approval_request()` has to be the thing that
actually moves the money / flips the status / records the amendment.

The `notifications` table's `type` CHECK gained
`approval_requested`/`approval_approved`/`approval_rejected`. The
`/approvals` page is visible to every role (so an employee can see their
own request history); approve/reject controls only render for
owner/manager, backed by the RPC's own gate either way.

## AI permission enforcement

`lib/ai/tools.ts` had zero role/permission checks before this phase —
`find_reservation` unconditionally returned `totalMad`/`remainingMad` to
any signed-in user. `buildTools()` now resolves the caller's permissions
once per conversation turn (`view_financial_reports`,
`edit_reservations`, `record_payments`, `manage_maintenance` — one
`has_permission()` round-trip per key, not per tool call) and gates:
financial fields on `find_reservation`/`get_customer_history`, and the
record-payment/cancel-reservation/schedule-maintenance proposal tools.
`askAI()` (the separate structured-output service, see
`docs/ai-service.md` — deliberately not used by the chat assistant)
gained an optional `requiredPermission` alongside its existing
`allowedRoles` allow-list, for callers that need finer granularity.
`lib/ai/__tests__/tools.test.ts` proves a Cleaner-role session's
`find_reservation`/`get_customer_history` results omit payment/balance
fields entirely, and that a Cleaner can't propose recording a payment.

## Mobile integration

`components/layout/quick-actions-sheet.tsx`'s six FAB actions were a
flat, unfiltered list shown to every role regardless of relevance —
each now carries a `roles` field (same convention as `NavItem.roles`),
and the FAB itself hides when a role has zero available actions.
`mobilePrimaryNav` gained a `Tasks` entry (→ `/maintenance`) for
cleaner/mechanic, and widened `Reservations` to include driver — safe
now that RLS scopes their reservations read to assigned-only.

`lib/mobile/mission-feed-data.ts` branches per role: cleaner/mechanic
pull from `maintenance_records` (assigned-or-unassigned, mirroring the
exact filter already used for reservations) instead of reservations;
every other role's feed is unchanged. `lib/mobile/mission-feed.ts`
(the pure card-building function) gained a `maintenanceJobs` input and
a `maintenanceCards()` builder — urgent priority reads as a critical
card, same tone convention as the reservation-overdue case.

**Superseded by productization wave 1 phase 2**: the visible product
no longer has a cleaner/mechanic role, so this branch, the
`maintenanceJobs` input, and `maintenanceCards()` were all deleted —
every role now gets the same reservation-centric mission feed. Left
here as a record of the phase-17 decision, not current behavior.

## Productization wave 1 phase 3 — the visible Staff access switches

No UI was ever built on top of this engine in any version of the
product — `role_permission_defaults`/`employee_permission_overrides`
existed only as backend infrastructure until this phase. Rather than
exposing the 16-key catalog directly, `lib/permissions/service.ts`
groups it into 3 switches an owner sees on each Staff (`manager`-role)
team member's row (`components/domain/employees/member-row.tsx`'s
"Access" disclosure):

| Switch | Permission keys |
|---|---|
| Can see financial information | `view_financial_reports` |
| Can edit or delete important records | `edit_customers`, `edit_reservations`, `manage_vehicles`, `generate_contracts`, `approve_contracts`, `manage_maintenance`, `manage_cleaning_tasks`, `record_payments`, `approve_refunds`, `download_documents` |
| Can manage settings, team and integrations | `manage_employees`, `configure_integrations` |

`view_customers`/`view_reservations`/`view_assigned_deliveries` are not
covered by any switch — baseline "can do the job" visibility every
Staff member keeps unconditionally. A switch reads ON only if every one
of its keys currently resolves true (`isSwitchOn()`); since `manager`'s
role defaults are already all-true, every switch starts ON for a Staff
member with no overrides — flipping one OFF writes a `false` override
for its keys via the existing `grant_permission_override()` RPC (no
engine or RLS changes this phase). The switches live on the member's
row, not the invite form — `grant_permission_override()` requires an
*active* membership, which an invitee doesn't have until they accept.

The full 16-key catalog stays engine-only and unexposed — an "Advanced"
panel surfacing it directly was explicitly out of scope for this phase
("optional later controls" per the brief) and hasn't been built.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` clean
at every checkpoint. New tests: `lib/permissions/__tests__/resolve.test.ts`
(override > default > false precedence, expiry respected — including the
"expires exactly now counts as expired" edge case),
`lib/ai/__tests__/tools.test.ts` (the Cleaner-cannot-see-payments
acceptance criterion), `lib/mobile/__tests__/mission-feed.test.ts`'s new
maintenance-card cases. Real mock-mode browser pass, done in this
session: cleaner/mechanic/driver each screenshotted at `/home`,
confirming the right tab count, FAB contents (or its absence), and feed
cards per role — see the phase 17 checkpoint 6 commit for what was
checked.

Same recurring limitation as every phase since 03: the live Supabase
project has no migrations applied, so none of this phase's RLS rewrite
or new RPCs have been exercised against real Postgres — verified via
tsc/lint/test/build plus the mock-mode browser pass instead, consistent
with every prior phase's documented limitation.
