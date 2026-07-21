-- Phase 12 of the RentalOS build roadmap ("AI Operations Feed Engine")
-- — bible Chapter 3 §4, Chapter 5 ("Observe, Understand, Recommend,
-- Prepare"), Chapter 10 §5.
--
-- One row per detected condition, keyed so re-running the observer job
-- naturally reconciles state rather than duplicating rows:
-- (company_id, observer_type, entity_type, entity_id) is unique.
-- `status` is itself a small state machine — `open` (currently true),
-- `dismissed` (a human said "not now," stays dismissed even if the
-- job keeps detecting the same condition), `resolved` (the job no
-- longer detects it — requirement 6's auto-clear). A `dismissed` item
-- is only ever revived by transitioning through `resolved` first (the
-- underlying condition genuinely went away) and then reappearing later
-- as a fresh `open` occurrence — never silently re-opened while the
-- same continuous occurrence is still being detected.
create table public.operations_feed_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  observer_type text not null,
  entity_type text not null check (entity_type in ('vehicle', 'customer', 'reservation', 'document', 'inspection')),
  entity_id uuid not null,
  priority_tier text not null check (priority_tier in ('critical', 'operational', 'business_health', 'informational')),
  observation text not null,
  reasoning text not null,
  suggested_action text not null,
  action_label text not null,
  action_href text not null,
  -- Deliberately text, not a 0-100 number: most observers here are
  -- plain deterministic checks (a date comparison IS the fact, not an
  -- estimate) — only the unusual-pricing observer's AI-assisted
  -- judgment call genuinely has "confidence" in the statistical sense.
  -- Forcing a fake precise number onto "insurance expires in 5 days"
  -- would misrepresent certainty that doesn't need hedging.
  confidence text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'dismissed', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles (id),
  unique (company_id, observer_type, entity_type, entity_id)
);

create index operations_feed_items_company_status_idx
  on public.operations_feed_items (company_id, status, priority_tier);

-- Observer thresholds (idle-vehicle days, stale-draft hours, pricing
-- deviation, inactive-customer months+value) are deliberately NOT
-- per-company settings here — see lib/operations-feed/thresholds.ts.
-- They're judgment calls in the same category as trust-score weights
-- or health-score bands elsewhere in this codebase: hardcoded, named,
-- documented constants, not exposed in Settings. Two settings this
-- phase genuinely reuses (maintenance_reminder_days,
-- document_expiry_warning_days) already exist from before this phase
-- and are already owner-configurable — no schema change needed for
-- those.

alter table public.operations_feed_items enable row level security;

create policy "Members can view operations feed items"
  on public.operations_feed_items for select
  using (public.is_company_member(company_id));

-- No general insert/update policy for authenticated users at all: the
-- observer job runs under the service-role key (see
-- lib/supabase/admin.ts), which bypasses RLS entirely by design — a
-- policy here would only ever apply to a path that doesn't exist.
-- Dismissal is the one thing a real signed-in user does, so it gets
-- its own narrow policy instead of a blanket update grant.
create policy "Front-desk roles can dismiss operations feed items"
  on public.operations_feed_items for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));
