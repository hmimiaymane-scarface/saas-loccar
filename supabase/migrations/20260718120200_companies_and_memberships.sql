-- A rental-company workspace. Every operational table below hangs off
-- company_id and is isolated by the RLS policies added in
-- 20260718120800_row_level_security.sql.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_path text,
  phone text,
  email text,
  address text,
  city text,
  country text not null default 'Morocco',
  currency text not null default 'MAD',
  timezone text not null default 'Africa/Casablanca',
  tax_id text,
  business_register text,
  default_language text not null default 'fr'
    check (default_language in ('fr', 'ar', 'en')),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- Who belongs to which company, and with what role. Rows here are only
-- ever written by the create_company_with_owner() RPC (see
-- 20260718120900_onboarding_function.sql) or, in a future phase, an
-- invitation RPC with the same SECURITY DEFINER pattern — never by a
-- direct client insert, which is why no INSERT/UPDATE/DELETE policy grants
-- this to ordinary authenticated users (see the RLS migration).
create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'agent', 'accountant', 'driver')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create trigger company_memberships_set_updated_at
  before update on public.company_memberships
  for each row execute function public.set_updated_at();

create index company_memberships_user_id_idx on public.company_memberships (user_id);
create index company_memberships_company_id_idx on public.company_memberships (company_id);
