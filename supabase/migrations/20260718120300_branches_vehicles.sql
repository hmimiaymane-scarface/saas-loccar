create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  address text,
  city text,
  phone text,
  is_active boolean not null default true,
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

create index branches_company_id_idx on public.branches (company_id);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  registration_number text not null,
  make text not null,
  model text not null,
  year integer not null check (year between 1980 and 2100),
  category text not null check (category in ('economy', 'compact', 'suv', 'van', 'luxury')),
  fuel_type text not null default 'petrol'
    check (fuel_type in ('petrol', 'diesel', 'hybrid', 'electric')),
  transmission text not null default 'manual'
    check (transmission in ('manual', 'automatic')),
  color text,
  seats integer check (seats > 0),
  odometer_km integer not null default 0 check (odometer_km >= 0),
  daily_rate numeric(10, 2) not null check (daily_rate >= 0),
  deposit_amount numeric(10, 2) check (deposit_amount >= 0),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'rented', 'maintenance', 'unavailable')),
  acquired_on date,
  acquisition_cost numeric(10, 2) check (acquisition_cost >= 0),
  insurance_expires_on date,
  registration_expires_on date,
  inspection_expires_on date,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, registration_number)
);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create index vehicles_company_id_idx on public.vehicles (company_id);
create index vehicles_company_status_idx on public.vehicles (company_id, status);
create index vehicles_branch_id_idx on public.vehicles (branch_id);
