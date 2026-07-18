# Supabase setup

This app runs against Supabase for auth, the database and (later) file
storage. This doc covers getting connected; see [security.md](./security.md)
for how access control actually works.

## 1. Create a Supabase project

Either the hosted dashboard (supabase.com -> New project) or the local CLI
stack (`supabase start`, requires Docker) — everything below works the
same against either.

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The first two are on Project Settings -> API in the dashboard, or printed
by `supabase status` locally. Both are meant to be public — Row Level
Security is what actually protects data, not hiding these values.

`SUPABASE_SERVICE_ROLE_KEY` is only used by `scripts/` (nothing under
`app/` or `components/` ever imports it). Never prefix it with
`NEXT_PUBLIC_`.

**Without these variables set, the app runs on local mock data** (see
"Data modes" below) rather than failing to boot.

## 3. Run the migrations

```
supabase link --project-ref <your-project-ref>   # hosted project only
supabase db push                                  # applies supabase/migrations/*.sql
```

Local stack instead:

```
supabase start
supabase db reset   # applies migrations, then supabase/seed.sql
```

Migrations run in filename order — don't renumber existing files; add new
ones with a later timestamp prefix.

## 4. Seed data

`supabase/seed.sql` only runs automatically with `supabase db reset`
(local stack). It creates one Moroccan rental company ("Atlas Rent Car")
with a realistic small owner-operated fleet: a vehicle mid-maintenance,
a completed maintenance record linked to exactly one expense, an
overdue (unreturned) rental, an unpaid completed reservation with an
unresolved deposit, a newly-discovered damage, a vehicle document
expiring soon, expenses across several categories spanning two months,
a second team member (manager) who already accepted an invitation, and
one pending invitation — enough to exercise every "needs attention"
live alert and give Reports two periods to compare.

It also creates a local-only login: `owner@atlasrentcar.ma` /
`Password123!`. See the comment at the top of `seed.sql` if that block
errors on your Supabase CLI version (auth-schema seeding is a documented
pattern but not a stable public API).

On a hosted project, seed data isn't applied automatically — either run
`psql "$DATABASE_URL" -f supabase/seed.sql` yourself (after replacing the
hardcoded user id with a real signed-up user's id) or just sign up through
the app and use the onboarding flow.

## 5. Run locally

```
npm install
npm run dev
```

Visit `/sign-up` to create an account (or `/sign-in` with the seeded
login), then `/onboarding` to create your company if you don't have one
yet.

## 6. Regenerating types

`types/database.ts` is hand-written to match the migrations (see the
comment at the top of that file). Once a project is linked, prefer:

```
supabase gen types typescript --linked > types/database.ts
```

and re-apply the doc comment. Generated types also carry relationship
metadata that the hand-written version doesn't, which improves
type-inference on `.select()` calls with embedded joins.

## Data modes (`lib/data.ts`)

Three states, controlled by environment, never by a caught error:

| State | Trigger | Behavior |
|---|---|---|
| Mock | `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` unset | Fixed Atlas Rent Car demo data, in-memory |
| Mock (forced) | `NEXT_PUBLIC_USE_MOCK_DATA=true` | Same, even with real credentials present |
| Live | Credentials set, flag unset | Real Supabase queries, scoped by `company_id` |

In live mode, a failed query throws — it is never caught and silently
replaced with mock data. That distinction matters: mock mode is a known,
declared state for local setup and demos; a live-mode failure should be a
visibly broken page, not a fake one.

Every page gets its `companyId` from `getSessionContext()`
(`lib/auth/session.ts`), called once per request layout, and passes it
into the `lib/data.ts` functions it needs
(`getOverviewMetrics(companyId)`, `getVehicles(companyId)`, ...).
Components never import `lib/mock/*` or call Supabase directly.

## Multi-company model

One `companies` row per rental business. `company_memberships` links users
to companies with a role (`owner`, `manager`, `agent`, `accountant`,
`driver`). The schema and RLS already support one user belonging to
multiple companies — the current UI just doesn't have a switcher yet,
since every user has exactly one membership today (created during
onboarding).

## Authentication flow

- `/sign-up` -> `app/(auth)/actions.ts#signUp` -> Supabase Auth ->
  confirmation email (if enabled in your project) -> `/auth/callback`
  exchanges the code for a session -> `/onboarding` (or, for someone
  arriving via an invite link, straight to `/invite/[token]` instead —
  `signUp` forwards a `?next=` through `emailRedirectTo` so an invited
  person never gets routed through "create a company").
- `/sign-in` -> `signIn` -> redirects to `?next=` or `/overview`.
- `proxy.ts` (this Next.js version's `middleware.ts`) refreshes the
  session on every request and enforces: unauthenticated -> `/sign-in`;
  authenticated with no *active* company membership -> `/onboarding`,
  except `/invite/*` which stays reachable without a company. Both are
  convenience redirects, not the security boundary (RLS is — see
  security.md).
- Sign-out: the user menu calls the `signOut` server action.

## Onboarding and invitations

`/onboarding` collects company name, city, phone, currency and language,
then calls `create_company_with_owner()`. `/invite/[token]` is the other
way to get a membership: an owner/manager sends a link from the Team page
(`/employees`, backed by `invite_member()`), and the recipient accepts it
via `accept_invitation()` after signing in — see security.md for the full
RPC list and the guarantees each one enforces (no self-promotion, last
owner protected, etc). Neither path lets a client insert a
`company_memberships` row directly.

## Known unfinished areas (next phase)

- `driver` role has no write path yet, by design.
- No per-branch access scoping — a membership can record which branch
  someone belongs to, but nothing enforces it at the RLS level yet (most
  target companies have exactly one branch).
- No outbound email — invitations are shared by copying a link from the
  Team page (WhatsApp, SMS, in person), not sent automatically.
- No public booking website, WhatsApp integration, AI assistant, or SaaS
  founder dashboard — explicitly out of scope through this phase.
