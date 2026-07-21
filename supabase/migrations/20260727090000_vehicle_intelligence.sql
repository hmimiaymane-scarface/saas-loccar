-- Phase 06 of the RentalOS build roadmap ("Vehicle Intelligence: Health,
-- Profitability & Utilization") — the bible's Pillar One, Chapter 5
-- §7-12. One cached row per vehicle, recomputed on relevant events
-- (vehicle_returned, maintenance_completed, damage_recorded — see
-- lib/vehicle-intelligence-store.ts#recomputeVehicleIntelligence) rather
-- than on every page load, same "no background job infra, so trigger
-- synchronously from the action that caused the change" convention as
-- every prior phase.
--
-- health_factors / profitability_breakdown / utilization are jsonb, not
-- normalized columns — they're read-mostly, always read as a whole (never
-- filtered/sorted on a sub-field), and their shape is expected to evolve
-- as scoring improves. Same tradeoff document_extractions' `fields`
-- column already made.
create table public.vehicle_intelligence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  health_score integer not null check (health_score between 0 and 100),
  health_band text not null check (health_band in ('excellent', 'good', 'fair', 'poor')),
  health_factors jsonb not null,
  profitability_net_mad numeric(12, 2) not null,
  profitability_breakdown jsonb not null,
  utilization jsonb not null,
  -- Null when generation hasn't run yet or the AI provider wasn't
  -- configured/failed — recommendations are advisory and best-effort,
  -- never block the score computation itself (see phase 05's askAI()).
  recommendations jsonb,
  recommendations_confidence text check (recommendations_confidence in ('high', 'medium', 'low')),
  computed_reason text not null,
  computed_at timestamptz not null default now(),
  unique (company_id, vehicle_id)
);

create index vehicle_intelligence_company_vehicle_idx on public.vehicle_intelligence (company_id, vehicle_id);

alter table public.vehicle_intelligence enable row level security;

create policy "Members can view vehicle intelligence"
  on public.vehicle_intelligence for select
  using (public.is_company_member(company_id));

-- Recompute runs inside the same front-desk actions that already write
-- maintenance/damage/reservation data (see the phase 06 wiring in
-- app/(dashboard)/{reservations,maintenance,damages}/actions.ts) — same
-- role set as those tables' own insert/update policies.
create policy "Front-desk roles can write vehicle intelligence"
  on public.vehicle_intelligence for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.company_id = vehicle_intelligence.company_id)
  );

create policy "Front-desk roles can update vehicle intelligence"
  on public.vehicle_intelligence for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

-- No delete policy — a superseded score is just overwritten by the next
-- recompute (unlike documents/activity_log, there's no version history
-- value in keeping stale scores around).
