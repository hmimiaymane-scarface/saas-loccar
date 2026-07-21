-- Phase 05 of the RentalOS build roadmap ("AI Platform Service Layer").
-- One row per askAI() call (lib/ai/service.ts), success or failure —
-- requirement 7's "log which module/purpose triggered each AI call."
--
-- A dedicated table rather than reusing the phase 01 event backbone
-- (activity_log): that table's entity_type is a closed enum of concrete
-- business entities (customer, vehicle, reservation, ...) an event is
-- *about* — an AI service call is a cross-cutting infrastructure
-- concern, not tied to one entity, and forcing it in would mean either a
-- fake entity_id or growing that enum for every future AI purpose
-- (vehicle health, customer trust, contract review, ...). This table is
-- purpose-built for that instead, and is where future cost/token
-- tracking naturally extends (see docs/ai-service.md).
--
-- `role` is plain text, not FK'd/checked against the EmployeeRole enum
-- on purpose — phase 12's background jobs will call askAI() with no
-- human actor at all (role: 'system'/'ai'), same forward-compatible
-- convention as activity_log.actor_type.
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  role text not null,
  purpose text not null,
  provider text not null,
  model text not null,
  success boolean not null,
  error_code text,
  created_at timestamptz not null default now()
);

create index ai_usage_log_company_created_idx on public.ai_usage_log (company_id, created_at desc);
create index ai_usage_log_company_purpose_idx on public.ai_usage_log (company_id, purpose);

alter table public.ai_usage_log enable row level security;

create policy "Members can view ai usage log"
  on public.ai_usage_log for select
  using (public.is_company_member(company_id));

-- Any company member can log their own usage — the coarse RLS gate here
-- is membership, not a role allow-list, because askAI() itself already
-- enforces the fine-grained "which roles can make this specific call"
-- check (its allowedRoles parameter) before ever reaching this insert.
create policy "Members can record ai usage"
  on public.ai_usage_log for insert
  with check (public.is_company_member(company_id));

-- No update/delete for anyone — append-only, same as activity_log and
-- document_extractions.
