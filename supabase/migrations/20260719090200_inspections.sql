-- Pickup and return inspections. A completed inspection is a business
-- record: once `status = 'completed'`, RLS (see
-- 20260719090800_handoff_rls.sql) blocks ordinary UPDATEs to it — the
-- only way to change a completed inspection afterward is the
-- correct_inspection() SECURITY DEFINER function
-- (20260719090900_activate_complete_rental.sql), which requires a reason
-- and is logged.
create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  type text not null check (type in ('pickup', 'return')),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  performed_by uuid references auth.users (id) on delete set null,
  odometer_km integer check (odometer_km >= 0),
  fuel_level text check (fuel_level in ('empty', 'quarter', 'half', 'three_quarter', 'full')),
  cleanliness text check (cleanliness in ('clean', 'average', 'dirty')),
  overall_condition text check (overall_condition in ('excellent', 'good', 'fair', 'poor')),
  notes text,
  customer_acknowledged boolean not null default false,
  customer_acknowledged_at timestamptz,
  completed_at timestamptz,
  correction_reason text,
  corrected_by uuid references auth.users (id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One pickup and one return inspection per reservation for this phase —
  -- the brief explicitly asks us not to allow duplicates "unless the
  -- architecture deliberately supports revisions" (it doesn't yet;
  -- corrections happen in place via correct_inspection(), not a second row).
  unique (reservation_id, type)
);

create trigger inspections_set_updated_at
  before update on public.inspections
  for each row execute function public.set_updated_at();

create index inspections_company_id_idx on public.inspections (company_id);
create index inspections_reservation_id_idx on public.inspections (reservation_id);
create index inspections_vehicle_id_idx on public.inspections (vehicle_id);
create index inspections_company_status_idx on public.inspections (company_id, status);

-- Per-item checklist responses for a given inspection.
create table public.inspection_checklist_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  item_key text not null,
  -- Snapshot of the template label at response time, so a later rename of
  -- the template item doesn't rewrite history on old inspections.
  item_label text not null,
  category text not null check (category in ('condition', 'documents_and_items')),
  response text not null default 'good' check (response in ('good', 'damaged', 'missing', 'not_applicable')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, item_key)
);

create trigger inspection_checklist_responses_set_updated_at
  before update on public.inspection_checklist_responses
  for each row execute function public.set_updated_at();

create index inspection_checklist_responses_inspection_id_idx on public.inspection_checklist_responses (inspection_id);
create index inspection_checklist_responses_company_id_idx on public.inspection_checklist_responses (company_id);
