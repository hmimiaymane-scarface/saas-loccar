-- A single `status` column covers the whole damage lifecycle (existing ->
-- ... -> closed) rather than separate "damage status" and "resolution
-- status" columns — two overlapping status fields is exactly the kind of
-- duplicated source of truth the phase brief warns against for deposits,
-- and the same principle applies here.
create table public.damages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete set null,
  discovered_in_inspection_id uuid references public.inspections (id) on delete set null,
  status text not null default 'newly_discovered' check (status in (
    'existing',
    'newly_discovered',
    'under_review',
    'customer_responsible',
    'agency_responsible',
    'repair_planned',
    'repaired',
    'closed'
  )),
  category text not null default 'other' check (category in (
    'bodywork', 'glass', 'interior', 'mechanical', 'tyre', 'electrical', 'other'
  )),
  vehicle_area text not null,
  severity text not null default 'minor' check (severity in ('minor', 'moderate', 'severe')),
  description text not null,
  pre_existing boolean not null default false,
  estimated_cost numeric(10, 2) check (estimated_cost >= 0),
  actual_cost numeric(10, 2) check (actual_cost >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger damages_set_updated_at
  before update on public.damages
  for each row execute function public.set_updated_at();

create index damages_company_id_idx on public.damages (company_id);
create index damages_vehicle_id_idx on public.damages (vehicle_id);
create index damages_reservation_id_idx on public.damages (reservation_id);
create index damages_company_status_idx on public.damages (company_id, status);
