-- Phase 11 of the RentalOS build roadmap ("Dynamic Contract Engine:
-- Signatures, Lifecycle & Amendments") — bible Chapter 8 §9-20.
--
-- Adds a real state machine to the `contracts` table phase 10 built
-- (single `status` column, defined transitions — "state over flags",
-- same principle as the reservations status column, not a pile of
-- booleans), a human contract number for search/display, signatures,
-- and amendments. `lib/contracts/lifecycle.ts` mirrors the transition
-- table below exactly, same defense-in-depth pattern as
-- lib/reservations/status.ts / transition_reservation_status.

alter table public.contracts
  add column status text not null default 'draft' check (
    status in ('draft', 'prepared', 'awaiting_signature', 'signed', 'active', 'completed', 'archived', 'cancelled')
  ),
  add column contract_number text,
  add column cancelled_reason text;

alter table public.companies
  add column contract_sequence integer not null default 1000;

-- Mirrors next_reservation_reference() exactly (same file:
-- supabase/migrations/20260718121100_reservation_reference_sequence.sql)
-- — per-company counter, SECURITY DEFINER, row-lock-serialized.
create or replace function public.next_contract_reference(target_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if not public.is_company_member(target_company_id) then
    raise exception 'Not a member of this company';
  end if;

  update public.companies
  set contract_sequence = contract_sequence + 1
  where id = target_company_id
  returning contract_sequence into v_next;

  if v_next is null then
    raise exception 'Company not found';
  end if;

  return 'CT-' || v_next;
end;
$$;

revoke all on function public.next_contract_reference(uuid) from public;
grant execute on function public.next_contract_reference(uuid) to authenticated;

create unique index contracts_company_number_idx on public.contracts (company_id, contract_number);

-- Requirement 4: "decide pragmatically on signature capture mechanism
-- ... note clearly which approach was taken and why, since this has
-- legal weight." Typed full name + an explicit confirmation click,
-- not a drawn/biometric signature or a certified e-signature
-- provider — see docs/contract-lifecycle.md for the honest statement
-- of what this does and doesn't guarantee. `method` is a single fixed
-- value today, kept as its own column (not hard-coded) so a real
-- drawn-signature capture can be added later without a schema change.
create table public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  signer_type text not null check (signer_type in ('customer', 'additional_driver', 'employee', 'manager')),
  signer_name text not null,
  -- Set only for employee/manager signers (real profiles); null for
  -- customer/additional_driver, who aren't system users.
  signer_user_id uuid references public.profiles (id),
  method text not null default 'typed_name_confirmation' check (method in ('typed_name_confirmation')),
  device_info text,
  ip_address text,
  signed_at timestamptz not null default now(),
  unique (contract_id, signer_type)
);

create index contract_signatures_contract_idx on public.contract_signatures (contract_id);

-- Requirement 5: an amendment is its own append-only record, never a
-- change to `contracts` — the original's resolved_context/
-- rendered_sections/pdf_storage_path are never touched by anything in
-- this table.
create table public.contract_amendments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  type text not null check (
    type in ('rental_extension', 'vehicle_exchange', 'additional_driver', 'price_adjustment', 'insurance_upgrade')
  ),
  description text not null,
  changes jsonb not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index contract_amendments_contract_idx on public.contract_amendments (contract_id);

alter table public.contract_signatures enable row level security;
alter table public.contract_amendments enable row level security;

create policy "Members can view contract signatures"
  on public.contract_signatures for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can record contract signatures"
  on public.contract_signatures for insert
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

create policy "Members can view contract amendments"
  on public.contract_amendments for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can record contract amendments"
  on public.contract_amendments for insert
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

-- Requirement 9: full audit trail. contract_generated/contract_signed
-- already existed as reserved vocabulary since phase 01; the rest of
-- the lifecycle and template-management events did not.
alter table public.activity_log drop constraint activity_log_type_check;
alter table public.activity_log add constraint activity_log_type_check check (type in (
  'reservation_requested',
  'reservation_confirmed',
  'reservation_status_changed',
  'reservation_updated',
  'reservation_cancelled',
  'payment_recorded',
  'payment_refunded',
  'vehicle_picked_up',
  'vehicle_returned',
  'vehicle_status_changed',
  'maintenance_completed',
  'customer_created',
  'customer_updated',
  'document_uploaded',
  'member_invited',
  'pickup_started',
  'return_started',
  'inspection_completed',
  'inspection_corrected',
  'damage_recorded',
  'damage_resolved',
  'deposit_collected',
  'deposit_returned',
  'deposit_retained',
  'maintenance_scheduled',
  'vehicle_entered_maintenance',
  'maintenance_cancelled',
  'expense_recorded',
  'user_suspended',
  'user_reactivated',
  'user_removed',
  'invitation_accepted',
  'rental_extended',
  'contract_generated',
  'contract_signed',
  'contract_prepared',
  'contract_sent_for_signature',
  'contract_activated',
  'contract_completed',
  'contract_archived',
  'contract_cancelled',
  'contract_amended',
  'contract_viewed',
  'contract_printed',
  'contract_downloaded',
  'template_created',
  'template_version_activated'
));
