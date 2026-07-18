create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) > 0),
  phone text not null,
  email text,
  nationality text,
  id_document_number text,
  license_number text,
  license_issued_on date,
  license_expires_on date,
  address text,
  notes text,
  status text not null default 'active'
    check (status in ('active', 'flagged', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create index customers_company_id_idx on public.customers (company_id);
create index customers_company_phone_idx on public.customers (company_id, phone);

-- Booking schema and read access only in this phase — no availability
-- calculation or write workflow yet (see AGENTS brief for this phase).
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  customer_id uuid not null references public.customers (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  requested_category text
    check (requested_category is null or requested_category in ('economy', 'compact', 'suv', 'van', 'luxury')),
  reference text not null,
  pickup_at timestamptz not null,
  return_at timestamptz not null,
  pickup_location text,
  return_location text,
  status text not null default 'request'
    check (status in ('request', 'pending', 'confirmed', 'active', 'completed', 'cancelled', 'no_show')),
  source text not null default 'walk_in'
    check (source in ('walk_in', 'phone', 'whatsapp', 'website', 'partner', 'other')),
  daily_rate numeric(10, 2) not null check (daily_rate >= 0),
  num_days integer not null check (num_days > 0),
  discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  amount_paid numeric(10, 2) not null default 0 check (amount_paid >= 0),
  remaining_balance numeric(10, 2) generated always as (total_amount - amount_paid) stored,
  deposit_amount numeric(10, 2) check (deposit_amount >= 0),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reference),
  check (return_at > pickup_at),
  check (amount_paid <= total_amount),
  check (vehicle_id is not null or requested_category is not null)
);

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

create index reservations_company_id_idx on public.reservations (company_id);
create index reservations_company_status_idx on public.reservations (company_id, status);
create index reservations_company_pickup_idx on public.reservations (company_id, pickup_at);
create index reservations_company_return_idx on public.reservations (company_id, return_at);
create index reservations_vehicle_id_idx on public.reservations (vehicle_id);
create index reservations_customer_id_idx on public.reservations (customer_id);
