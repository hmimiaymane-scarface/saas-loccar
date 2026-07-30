-- Roadmap phase 49 (Founder-Assisted Migration Mode). A platform-admin
-- checklist tracking each new client through white-glove onboarding
-- (receiving/cleaning/importing their spreadsheet, validating counts,
-- logo, contract template, owner login, a tested first reservation) —
-- see docs/founder-assisted-migration.md. Follows the exact
-- platform-admin table pattern already established by
-- 20260721090100_company_subscriptions.sql / 20260721090300_platform_mutations.sql:
-- RLS enabled, select-only for is_platform_admin(), no direct
-- INSERT/UPDATE/DELETE policy, every mutation through a SECURITY
-- DEFINER function that re-checks admin status and logs via
-- log_platform_action().

create table public.migration_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  step_key text not null,
  sort_order integer not null,
  is_done boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, step_key)
);

create index migration_checklist_items_company_idx on public.migration_checklist_items (company_id, sort_order);

alter table public.migration_checklist_items enable row level security;

create policy "Platform admins can view migration checklist items"
  on public.migration_checklist_items for select
  using (public.is_platform_admin());

-- No INSERT/UPDATE/DELETE policy — rows are only ever created by the
-- seed trigger below (runs as the table owner, bypassing RLS) and
-- mutated only through platform_toggle_migration_checklist_item().

-- Every company gets the full 8-step checklist the moment it's
-- created, so the platform UI never has to special-case a missing
-- row — same reasoning as provision_default_subscription().
--
-- 'owner_login_created' is pre-marked done: create_company_with_owner()
-- (20260718120900_onboarding_function.sql) requires an authenticated
-- caller and inserts the owner membership atomically with the company
-- row itself, so there is no way for this trigger to ever fire without
-- a real owner login already existing. Showing that step unchecked
-- would be actively misleading, not just conservative.
create or replace function public.seed_migration_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.migration_checklist_items (company_id, step_key, sort_order, is_done, completed_at)
  values
    (new.id, 'spreadsheet_received', 1, false, null),
    (new.id, 'spreadsheet_cleaned', 2, false, null),
    (new.id, 'data_imported', 3, false, null),
    (new.id, 'import_counts_validated', 4, false, null),
    (new.id, 'logo_uploaded', 5, false, null),
    (new.id, 'contract_template_set', 6, false, null),
    (new.id, 'owner_login_created', 7, true, now()),
    (new.id, 'first_reservation_tested', 8, false, null);
  return new;
end;
$$;

create trigger companies_seed_migration_checklist
  after insert on public.companies
  for each row execute function public.seed_migration_checklist();

-- Backfill for every company that already existed before this
-- migration — 'owner_login_created' is true for all of them too (the
-- same causal guarantee applies retroactively), the other 7 steps
-- start unchecked since none of them were tracked before this phase.
insert into public.migration_checklist_items (company_id, step_key, sort_order, is_done, completed_at)
select
  c.id,
  v.step_key,
  v.sort_order,
  (v.step_key = 'owner_login_created'),
  (case when v.step_key = 'owner_login_created' then c.created_at else null end)
from public.companies c
cross join (values
  ('spreadsheet_received', 1),
  ('spreadsheet_cleaned', 2),
  ('data_imported', 3),
  ('import_counts_validated', 4),
  ('logo_uploaded', 5),
  ('contract_template_set', 6),
  ('owner_login_created', 7),
  ('first_reservation_tested', 8)
) as v(step_key, sort_order)
on conflict (company_id, step_key) do nothing;

create or replace function public.platform_get_migration_checklist(p_company_id uuid)
returns table (
  step_key text,
  sort_order integer,
  is_done boolean,
  completed_at timestamptz,
  completed_by_email text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  select mci.step_key, mci.sort_order, mci.is_done, mci.completed_at, u.email
  from public.migration_checklist_items mci
  left join auth.users u on u.id = mci.completed_by
  where mci.company_id = p_company_id
  order by mci.sort_order;
end;
$$;

create or replace function public.platform_toggle_migration_checklist_item(
  p_company_id uuid,
  p_step_key text,
  p_is_done boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();

  update public.migration_checklist_items
  set
    is_done = p_is_done,
    completed_at = case when p_is_done then now() else null end,
    completed_by = case when p_is_done then auth.uid() else null end
  where company_id = p_company_id and step_key = p_step_key;

  if not found then
    raise exception 'No checklist item for that company/step.';
  end if;

  perform public.log_platform_action(
    p_company_id,
    case when p_is_done then 'migration_checklist_item_completed' else 'migration_checklist_item_reopened' end,
    p_step_key
  );
end;
$$;

revoke all on function public.platform_get_migration_checklist(uuid) from public;
revoke all on function public.platform_toggle_migration_checklist_item(uuid, text, boolean) from public;

grant execute on function public.platform_get_migration_checklist(uuid) to authenticated;
grant execute on function public.platform_toggle_migration_checklist_item(uuid, text, boolean) to authenticated;
