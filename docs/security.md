# Security model

## Isolation boundary

Every rental company's data lives in the same Postgres tables, distinguished
by a `company_id` column. **Row Level Security (RLS) is the only thing that
enforces isolation.** The Next.js app, the middleware, and the navigation
are usability layers on top — none of them are load-bearing for security.
If a request reaches Postgres with a valid but low-privilege session, RLS
is what stops it from touching another company's rows, even if every layer
above it were bypassed or buggy.

## Membership and roles

A user gets access to a company through a row in `company_memberships`
(`company_id`, `user_id`, `role`). Roles: `owner`, `manager`, `agent`,
`accountant`, `driver`. A user may belong to multiple companies (multiple
membership rows) — the schema supports this today even though the current
UI assumes one company per user.

**Membership rows cannot be written by ordinary clients.** There is no
INSERT/UPDATE/DELETE policy on `company_memberships` for the `authenticated`
role. The only way to create one is `create_company_with_owner()`, a
`SECURITY DEFINER` function that always assigns `auth.uid()` (never a
client-supplied id) as `owner` of a company it just created. This is what
guarantees:

- A user cannot promote themselves to `owner` of an existing company.
- A user cannot join a company they weren't invited to (no invite flow
  exists yet — this is intentional; see "Known limitations").
- A user cannot forge someone else's membership.

A future invitation feature must follow the same pattern: a
`SECURITY DEFINER` RPC that validates the inviter's role server-side, never
a direct table insert from the client.

## Avoiding RLS recursion

A naive policy on `company_memberships` that queries `company_memberships`
to authorize itself would recurse. Instead, all policies call one of four
helper functions (`supabase/migrations/20260718120700_security_helper_functions.sql`):

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

## Per-table access

| Table | Read | Write | Delete |
|---|---|---|---|
| `companies` | members | owner/manager (update only) | — (not exposed) |
| `company_memberships` | own row, or owner/manager of the company | — (RPC only) | — |
| `branches`, `vehicles`, `maintenance_records` | members | owner/manager | owner/manager (branches: owner only) |
| `customers`, `reservations` | members | owner/manager/agent | owner/manager |
| `payments`, `expenses` | members | owner/manager/accountant | owner/manager |
| `activity_log` | members | any member (insert only) | nobody — append-only |

`driver` is read-only across every table in this phase. Scoped write access
(marking an assigned pickup/return/inspection complete) is a future phase.

Every INSERT/UPDATE policy re-checks `company_id` in its `WITH CHECK`
clause against the same helper functions. That's what stops a member of
company A from writing a row — or retargeting an existing row via UPDATE —
to claim `company_id = B`: the check is evaluated against the *new* row,
and the caller is never a member of B.

## What the app layer adds on top

- `middleware.ts` redirects unauthenticated requests to `/sign-in` and
  gates dashboard routes behind having at least one company membership
  (redirecting to `/onboarding` otherwise). This is for UX flow, not
  security — RLS holds even if this redirect is skipped.
- `lib/auth/session.ts` centralizes "who is the user, what's their current
  company, what's their role" so pages don't each re-derive it.
- `lib/navigation.ts` filters visible nav items by role so people aren't
  shown sections they can't act on. Hiding a link is not access control;
  the database policies above are.

## Known limitations (intentional, for a future phase)

- No invitation flow yet — the schema and RLS pattern are ready for one,
  but onboarding only creates a single owner.
- No per-branch access restriction (e.g. an agent scoped to one branch) —
  access is company-wide once a role permits an action.
- `driver` has no write path yet, by design.
- Financial totals on `reservations` (`amount_paid`, `remaining_balance`)
  are not yet reconciled against the `payments` ledger by a trigger; until
  the reservation workflow ships, treat `payments` as the source of truth
  for what's actually been collected.
