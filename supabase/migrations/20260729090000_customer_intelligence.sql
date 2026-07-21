-- Phase 08 of the RentalOS build roadmap ("Customer Intelligence: Trust
-- Score, Lifetime Value & Duplicates") — the bible's Pillar Two.
--
-- Two additive columns on `customers`:
--   date_of_birth — requirement 3 lists birth date as a duplicate-
--     matching factor, but nothing in this schema captured it before
--     now. Nullable: no upload/onboarding flow writes it yet (that's
--     future UI work, out of scope here per the phase's own non-goal)
--     — matching only ever compares it when both sides have a value.
--   marketing_consent — requirement 4's explicit constraint: segment
--     queries must respect consent, and no consent field existed to
--     respect. Defaults false (opt-in, not opt-out) since no existing
--     flow ever asked for it — a customer created before this migration
--     is correctly treated as "no consent on file" rather than silently
--     assumed opted in.
alter table public.customers
  add column date_of_birth date,
  add column marketing_consent boolean not null default false;

-- Powers lib/customer-segments.ts's "customers with consent" filter —
-- the first predicate every segmentation query applies.
create index customers_company_consent_idx
  on public.customers (company_id, marketing_consent)
  where marketing_consent = true;

-- One cached row per customer, same shape/lifecycle as phase 06's
-- vehicle_intelligence — recomputed on events (new rental completed,
-- payment received, damage reported), not on every page load.
create table public.customer_intelligence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  trust_score integer not null check (trust_score between 0 and 100),
  trust_band text not null check (trust_band in ('excellent', 'good', 'fair', 'poor')),
  trust_factors jsonb not null,
  lifetime_revenue_mad numeric(12, 2) not null,
  rental_frequency_per_year numeric(8, 2) not null,
  average_reservation_mad numeric(12, 2) not null,
  expected_future_value_mad numeric(12, 2) not null,
  preferred_category text,
  summary text,
  computed_reason text not null,
  computed_at timestamptz not null default now(),
  unique (company_id, customer_id)
);

create index customer_intelligence_company_customer_idx on public.customer_intelligence (company_id, customer_id);

alter table public.customer_intelligence enable row level security;

create policy "Members can view customer intelligence"
  on public.customer_intelligence for select
  using (public.is_company_member(company_id));

-- Recompute runs inside the actions that already write reservation/
-- payment/damage data — same role set as those tables' own policies,
-- which is wider than vehicle_intelligence's (payments also allow
-- accountant; see "Finance roles can record payments").
create policy "Front-desk roles can write customer intelligence"
  on public.customer_intelligence for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent', 'accountant')
    and exists (select 1 from public.customers c where c.id = customer_id and c.company_id = customer_intelligence.company_id)
  );

create policy "Front-desk roles can update customer intelligence"
  on public.customer_intelligence for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent', 'accountant'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent', 'accountant'));

-- No delete policy — a superseded score is just overwritten by the
-- next recompute.
