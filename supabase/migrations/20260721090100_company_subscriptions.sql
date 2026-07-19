-- Manual subscription record — one row per company, maintained entirely
-- by hand by the platform owner. Deliberately separate from
-- companies.status (a pre-existing, purely informational tenant field
-- shown in the app header) rather than overloading it: this table is the
-- single source of truth for platform-controlled access, and nothing
-- about the existing tenant-facing status badge changes.

create table public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'suspended', 'cancelled')),
  plan_label text not null default 'Trial',
  trial_starts_on date,
  trial_ends_on date,
  subscription_starts_on date,
  subscription_ends_on date,
  monthly_price_mad numeric(10, 2) check (monthly_price_mad is null or monthly_price_mad >= 0),
  currency text not null default 'MAD',
  notes text,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger company_subscriptions_set_updated_at
  before update on public.company_subscriptions
  for each row execute function public.set_updated_at();

create index company_subscriptions_status_idx on public.company_subscriptions (status);

alter table public.company_subscriptions enable row level security;

-- Only platform admins can read subscription records directly (pricing,
-- notes, exact dates). Tenant users never get a policy here at all — the
-- one thing they're allowed to know (whether their own company is
-- suspended) is exposed narrowly through is_company_suspended() below,
-- not through table access.
create policy "Platform admins can view subscriptions"
  on public.company_subscriptions for select
  using (public.is_platform_admin());

-- No INSERT/UPDATE/DELETE policy — every mutation goes through the
-- SECURITY DEFINER functions in 20260721090300_platform_mutations.sql,
-- which double as the audit trail.

-- Every company gets a default trial subscription row the moment it's
-- created, so the platform dashboard never has to special-case a missing
-- record. This fires regardless of how the company was inserted (the
-- onboarding RPC or a direct seed insert), so no other code needs to know
-- about it.
create or replace function public.provision_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_subscriptions (company_id, status, plan_label, trial_starts_on, trial_ends_on)
  values (new.id, 'trial', 'Trial', current_date, current_date + interval '14 days');
  return new;
end;
$$;

create trigger companies_provision_subscription
  after insert on public.companies
  for each row execute function public.provision_default_subscription();

-- Backfill: every company that already existed before this migration.
insert into public.company_subscriptions (company_id, status, plan_label, trial_starts_on, trial_ends_on)
select id, 'trial', 'Trial', created_at::date, (created_at + interval '14 days')::date
from public.companies
on conflict (company_id) do nothing;
