-- Company-scoped audit trail for the handful of actions worth surfacing on
-- Overview (see lib/data.ts -> getRecentActivity). Append-only: no
-- UPDATE/DELETE policy is granted to anyone in the RLS migration.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null check (type in (
    'reservation_requested',
    'reservation_confirmed',
    'payment_recorded',
    'vehicle_picked_up',
    'vehicle_returned',
    'vehicle_status_changed',
    'maintenance_completed',
    'customer_created',
    'document_uploaded',
    'member_invited'
  )),
  title text not null,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_company_id_idx on public.activity_log (company_id);
create index activity_log_company_created_idx on public.activity_log (company_id, created_at desc);
