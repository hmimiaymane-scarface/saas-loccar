-- Single source of truth for deposit state (see the payments-ledger
-- migration for why `reservations.deposit_amount` is dropped in favour of
-- this table: one clear place for "what's expected / collected / returned
-- / retained" instead of two disagreeing fields).
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  status text not null default 'not_required' check (status in (
    'not_required',
    'expected',
    'collected',
    'partially_collected',
    'held',
    'partially_returned',
    'returned',
    'retained',
    'disputed'
  )),
  expected_amount numeric(10, 2) not null default 0 check (expected_amount >= 0),
  collected_amount numeric(10, 2) not null default 0 check (collected_amount >= 0),
  returned_amount numeric(10, 2) not null default 0 check (returned_amount >= 0),
  retained_amount numeric(10, 2) not null default 0 check (retained_amount >= 0),
  method text check (method in ('cash', 'card', 'transfer', 'other')),
  collected_at timestamptz,
  returned_at timestamptz,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id),
  -- Returned + retained can never exceed what was actually collected.
  check (returned_amount + retained_amount <= collected_amount)
);

create trigger deposits_set_updated_at
  before update on public.deposits
  for each row execute function public.set_updated_at();

create index deposits_company_id_idx on public.deposits (company_id);
create index deposits_company_status_idx on public.deposits (company_id, status);
