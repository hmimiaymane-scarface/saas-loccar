# Founder-Assisted Migration Mode

Roadmap phase 49, third phase of Wave 7 ("Switching, Setup, and
Customer Acquisition Readiness"), directly following phase 47 (Company
Setup Wizard) and phase 48 (CSV Importer). Brief: "turn early
onboarding into a service advantage" — a repeatable internal process
for white-glove-onboarding an early rental-agency client, tracked via
a new **Migration checklist** on `/platform/companies/[id]`.

**What this phase is, honestly**: a tracking tool, not new
automation. Every capability a founder actually uses to onboard a
client — sign-up, the company setup wizard, the CSV importer,
settings, contract templates — was already built in earlier phases.
This phase's own contribution is making the *process* repeatable and
visible: a fixed checklist per company, checked off as the founder
works through it, replacing "remember what's done from memory or a
side notebook" with a real, persistent record on the platform console.

## The hard constraint this process has to work around

There is no way for a platform admin (the founder) to create a
company or an owner account *on behalf of* a client. `create_company_with_owner()`
(`supabase/migrations/20260718120900_onboarding_function.sql`) requires
an authenticated caller and always makes `auth.uid()` — literally
whoever is signed in when the RPC runs — the owner:

```sql
declare
  v_user_id uuid := auth.uid();
...
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  ...
  insert into public.company_memberships (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner');
```

There is also no impersonation/act-as mechanism anywhere in this app,
and `invite_member()` requires the caller to already be an
owner/manager member of the target company — so a founder holding zero
membership in a brand-new company can't even invite themselves in
first. **The client must always be the one who runs `/sign-up` →
`/onboarding` step 1**, creating their own company and their own real
owner login. This is an architectural fact, not a product gap to route
around — building real on-behalf-of provisioning or impersonation
would be a much larger, security-sensitive undertaking than this phase
warrants, and isn't what "almost no effort on their side" actually
needs.

## The recommended process

1. **Spreadsheet received** — get the client's current fleet/customer
   spreadsheet (however they have it: Excel, Google Sheets, a PDF they
   retype, whatever).
2. **Spreadsheet cleaned** — tidy headers/values so `/import`'s column
   matcher can read it cleanly (see `docs/company-data-import.md`'s
   column-matching section — the importer's own export headers are
   already recognized as aliases, so matching an agency's ad hoc
   spreadsheet columns to consistent header names first speeds this up
   a lot).
3. **Client signs up, live, guided by the founder** (call or
   screen-share): the client runs `/sign-up` → the Company Setup
   Wizard's step 1 themselves — this is the one unavoidable two-minute
   step that has to be theirs, per the constraint above. Once their
   company exists, **they invite the founder in as a `manager`** (the
   wizard's own Team step, or later via `/employees`) — never as
   `owner`, and never by sharing their password. Every remaining step
   below is owner/manager-gated, so a manager invite is sufficient for
   the founder to do all of the actual white-glove work themselves
   from here on, inside the client's real account.
4. **Data imported** — the founder runs the cleaned spreadsheet through
   `/import` (vehicles first, then customers), reviewing the preview/
   duplicate-detection step before committing.
5. **Import counts validated** — compare `/import`'s own reported
   counts ("N ready to import / N flagged / N errors") against the
   original spreadsheet's row count; chase down any error/duplicate
   rows that don't reconcile before considering the import done.
6. **Logo uploaded** — via Settings or the onboarding wizard's Logo
   step, whichever the client already reached.
7. **Contract template set** — at least one usable contract template
   in place (`/contract-templates`).
8. **Owner login created** — by this point in the process this is
   already true (it happened in step 3) — this step exists on the
   checklist mainly as a completion marker for the founder's own
   record-keeping, not a remaining action. It's why
   `migration_checklist_items` seeds this specific step pre-checked for
   every company (see below) rather than making a platform admin tick
   a box for something the database already guarantees.
9. **First reservation tested** — the founder walks the client through
   creating one real reservation end-to-end, confirming the whole
   setup actually works before calling onboarding complete.

## The Migration checklist itself

`supabase/migrations/20260814090000_phase49_migration_checklist.sql`
adds `migration_checklist_items` — one row per company per step,
following the exact `company_subscriptions`/`platform_mutations`
pattern already established for the platform console (see
`docs/security.md`'s "Platform-owner boundary" section): RLS
select-only for `is_platform_admin()`, no direct mutation policy, a
trigger (`seed_migration_checklist()`) that inserts all 8 rows the
moment a company is created (mirroring `provision_default_subscription()`),
and two `SECURITY DEFINER` RPCs — `platform_get_migration_checklist`
(read) and `platform_toggle_migration_checklist_item` (write, re-checks
admin status and logs via `log_platform_action()` like every other
platform mutation).

`owner_login_created` is seeded **pre-checked**, both for new companies
and in the migration's backfill for every company that already
existed — it's causally guaranteed the moment a `companies` row can
exist at all, so showing it unchecked would be actively misleading,
not conservative.

The panel lives on `/platform/companies/[id]`
(`components/domain/platform/migration-checklist.tsx`), right
alongside the existing Subscription actions. The company summary
card's own "Onboarding" field — previously a hardcoded
`<SummaryRow label="Onboarding" value="Completed" />` stub left over
from the platform console's original build — now shows real computed
progress ("Complete" or "N of 8 steps") via
`lib/platform/migration-checklist.ts#migrationChecklistProgress()`.

## Deliberately not done

- **No on-behalf-of company/owner creation, no impersonation** — see
  "The hard constraint" above; this is a scope boundary this phase
  respects rather than works around.
- **No per-step notes/attachments** — the existing free-text "Internal
  notes" field on the same page already covers ad hoc context (first
  contact source, agreed price, support history); a second, narrower
  notes field per checklist step would be redundant.
- **No automated count-reconciliation** — "import counts validated" is
  a manual comparison the founder makes by eye between `/import`'s own
  reported summary and the source file; nothing computes or verifies
  this automatically.
- **No email/reminder nudges** for an in-progress migration sitting
  half-done — this is a checklist to track state, not a workflow
  automation with its own notification layer.

## Verification

Live-verified in mock mode (light + dark), across all three demo
company states the mock fixture models: a long-settled company shown
fully complete (8/8, "Complete"), a mid-migration trial (4/8, with
per-item "Completed Nd ago · email" lines on the done steps), and a
brand-new signup showing only the structurally-guaranteed
`owner_login_created` step checked (1/8). The company summary page's
real "Onboarding" progress line was confirmed to replace the old
hardcoded "Completed" stub correctly in all three cases.

**Toggling a checklist item does not work live in mock mode** —
confirmed directly, and confirmed this is not a regression: clicking
any existing pre-phase-49 platform mutation (e.g. "Save notes" on the
same page) throws the identical "Supabase is not configured" error,
since no platform action anywhere in this codebase has ever had a
mock-mode branch. This is the same standing, honestly-documented
limitation every mutation-touching phase since 03 has carried, not
something specific to this feature.

tsc/eslint/vitest (755 tests)/build were clean at every checkpoint.
