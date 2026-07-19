-- Platform-level authorization, entirely separate from rental-company
-- roles. A company owner or manager is a tenant role — it grants nothing
-- here. Platform-admin status can only ever be granted by inserting a row
-- directly (Studio/psql as the migration role, or a future controlled
-- process) — there is deliberately no INSERT/UPDATE/DELETE policy at all,
-- so no authenticated user, including an existing platform admin acting
-- through the app, can grant themselves or anyone else this status. See
-- docs/supabase.md for how to add the first admin locally and in
-- production.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
-- No policies at all: row level security with zero policies means every
-- role is denied by default, for every operation, including SELECT. The
-- only way anything reads this table is the SECURITY DEFINER function
-- below, which runs as the table owner and therefore bypasses RLS.

-- `set search_path = public` pins name resolution against a search_path
-- swap; `stable` allows Postgres to cache the result within one query.
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
