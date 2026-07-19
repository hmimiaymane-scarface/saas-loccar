-- Platform-owner action history — kept entirely separate from the
-- tenant-facing activity_log table, per the phase brief ("keep platform
-- audit data separate from normal rental-company activity"). Only ever
-- written by the SECURITY DEFINER mutation functions in
-- 20260721090300_platform_mutations.sql, never by a direct client insert.

create table public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  action text not null,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_log_company_id_idx on public.platform_audit_log (company_id);
create index platform_audit_log_created_at_idx on public.platform_audit_log (created_at desc);

alter table public.platform_audit_log enable row level security;

create policy "Platform admins can view the platform audit log"
  on public.platform_audit_log for select
  using (public.is_platform_admin());

-- No INSERT/UPDATE/DELETE policy — see log_platform_action() below.

create or replace function public.log_platform_action(
  p_company_id uuid,
  p_action text,
  p_description text default null,
  p_metadata jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.platform_audit_log (admin_id, company_id, action, description, metadata)
  values (auth.uid(), p_company_id, p_action, p_description, p_metadata);
$$;

revoke all on function public.log_platform_action(uuid, text, text, jsonb) from public;
-- Not granted to `authenticated` at all: this is called only from inside
-- the other SECURITY DEFINER functions in this migration set (which run
-- as the table owner, so they can call it regardless of grants), never
-- directly from application code.
