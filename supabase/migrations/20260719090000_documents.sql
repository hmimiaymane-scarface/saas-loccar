-- Formal paperwork (contracts, ID, licence, receipts, ...). The platform
-- never generates these — it only stores what an employee uploads and
-- links it to a reservation, customer and/or vehicle so the Documents
-- center and the pickup/return flow can find it again.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  category text not null check (category in (
    'rental_contract',
    'identity_document',
    'driving_licence',
    'proof_of_address',
    'insurance_document',
    'vehicle_registration',
    'technical_inspection',
    'payment_receipt',
    'other'
  )),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  contract_reference text,
  notes text,
  status text not null default 'active' check (status in ('active', 'replaced', 'deleted')),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reservation_id is not null or customer_id is not null or vehicle_id is not null)
);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create index documents_company_id_idx on public.documents (company_id);
create index documents_reservation_id_idx on public.documents (reservation_id);
create index documents_customer_id_idx on public.documents (customer_id);
create index documents_vehicle_id_idx on public.documents (vehicle_id);
create index documents_company_category_idx on public.documents (company_id, category);
