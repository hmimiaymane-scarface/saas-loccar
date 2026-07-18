-- Security-definer helper functions used throughout the RLS policies in
-- 20260718120800_row_level_security.sql.
--
-- Why SECURITY DEFINER: a plain policy on company_memberships that queries
-- company_memberships to authorize itself would recurse. These functions
-- are owned by the migration role (which owns the tables), so — per
-- Postgres's normal RLS behavior for table owners — the SELECT inside the
-- function body bypasses RLS entirely instead of recursing back into it.
-- `set search_path = public` pins name resolution so the function can't be
-- tricked by a search_path swap into querying an attacker-controlled table.
-- `stable` lets Postgres cache the result within a single query/statement.

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.company_role(target_company_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.company_memberships
  where company_id = target_company_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_company_manager_or_owner(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
  );
$$;

create or replace function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

-- Only authenticated users need these; anonymous callers have no auth.uid()
-- and every function above returns false/null for them regardless.
revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.company_role(uuid) from public;
revoke all on function public.is_company_manager_or_owner(uuid) from public;
revoke all on function public.is_company_owner(uuid) from public;

grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.company_role(uuid) to authenticated;
grant execute on function public.is_company_manager_or_owner(uuid) to authenticated;
grant execute on function public.is_company_owner(uuid) to authenticated;
