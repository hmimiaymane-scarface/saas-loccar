-- Records a payment made *outside* the platform (cash, card terminal, bank
-- transfer, ...). The platform never processes payments itself.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete set null,
  customer_id uuid not null references public.customers (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null default 'cash'
    check (method in ('cash', 'card', 'transfer', 'other')),
  paid_at timestamptz not null default now(),
  reference text,
  notes text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create index payments_company_id_idx on public.payments (company_id);
create index payments_company_paid_at_idx on public.payments (company_id, paid_at);
create index payments_reservation_id_idx on public.payments (reservation_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  category text not null
    check (category in ('fuel', 'maintenance', 'insurance', 'parking', 'fines', 'salary', 'rent', 'other')),
  amount numeric(10, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  supplier text,
  description text,
  receipt_path text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create index expenses_company_id_idx on public.expenses (company_id);
create index expenses_company_date_idx on public.expenses (company_id, expense_date);

create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  type text not null
    check (type in ('oil_change', 'inspection', 'tire', 'brake', 'insurance_renewal', 'registration_renewal', 'repair', 'other')),
  description text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_on date,
  completed_on date,
  odometer_km integer check (odometer_km >= 0),
  cost numeric(10, 2) check (cost >= 0),
  supplier text,
  next_service_on date,
  next_service_odometer_km integer check (next_service_odometer_km >= 0),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger maintenance_records_set_updated_at
  before update on public.maintenance_records
  for each row execute function public.set_updated_at();

create index maintenance_records_company_id_idx on public.maintenance_records (company_id);
create index maintenance_records_vehicle_id_idx on public.maintenance_records (vehicle_id);
create index maintenance_records_company_status_idx on public.maintenance_records (company_id, status);
