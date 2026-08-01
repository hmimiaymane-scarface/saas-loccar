-- Roadmap phase 58 ("Product Analytics / Usage Instrumentation"). Brief:
-- "Learn where owners struggle" — this is meta-analytics about how rental
-- companies use RentalOS itself, for the SaaS operator's own product
-- decisions, not a business-intelligence feature for a tenant's own
-- reporting. That's the deciding difference from every other event table
-- in this app and shapes both design choices below.
--
-- Not folded into activity_log (see 20260723090000_event_backbone.sql):
-- that table's type/entity_type are closed, hand-maintained enums for
-- durable *business* audit events ("a reservation was confirmed"); usage
-- telemetry ("a wizard step was viewed", "search was used") has no
-- business entity, is expected to grow new event names often, and would
-- pollute activity_log's own query surface (getEventsForEntity/
-- getEventsByType) if forced through it. Same reasoning ai_usage_log
-- already used for AI-call logging (20260726090000_ai_usage_log.sql) —
-- this table follows that precedent's shape closely.
--
-- Deliberately DIFFERENT from ai_usage_log in one way: no SELECT policy
-- for company members at all. ai_usage_log is tenant-visible (a company
-- can see its own AI usage); usage_events is the platform operator's own
-- product-analytics stream, not a report any tenant should see about
-- itself. The only read path is platform_get_usage_summary/
-- platform_get_dropoff_summary below, gated by assert_platform_admin()
-- (see 20260721090300_platform_mutations.sql) — same "insert allowed,
-- select locked down to a SECURITY DEFINER function" pattern as
-- platform_admins itself (20260721090000_platform_admins.sql).
--
-- event_type is plain text, not a CHECK-constrained enum — an open
-- vocabulary on purpose, since new event names are expected to be added
-- as the product evolves, and this table's whole point is to be cheap to
-- extend without a migration each time. Type safety for the fixed set of
-- event names this phase actually emits lives in TypeScript instead
-- (lib/analytics/events.ts's UsageEventType union).
--
-- session_id correlates events within one funnel *attempt* (one New
-- Rental wizard mount, one Return wizard mount) — a client-generated
-- uuid, not a browser/auth session, so re-opening the same wizard twice
-- in one tab counts as two attempts. Left null for events with no funnel
-- (search, quick actions, alerts, errors).
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type <> ''),
  session_id uuid,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_company_type_created_idx on public.usage_events (company_id, event_type, created_at desc);
create index usage_events_company_session_idx on public.usage_events (company_id, session_id) where session_id is not null;

alter table public.usage_events enable row level security;

-- Any company member can record their own usage — coarse membership
-- gate, matching activity_log/ai_usage_log's own insert policy. No role
-- distinction: every role's clicks are equally worth learning from.
create policy "Members can record usage events"
  on public.usage_events for insert
  with check (public.is_company_member(company_id));

-- No SELECT policy for anyone, including the company that generated the
-- rows (see the file header) — same "RLS denies everything by default,
-- only a SECURITY DEFINER function can read it" shape as platform_admins.
-- No UPDATE/DELETE either: append-only.

-- ---------------------------------------------------------------------
-- Read side: two narrow aggregates, same style as platform_get_overview
-- (20260721090400_platform_reads.sql) — plpgsql so the body can
-- `perform assert_platform_admin()` before returning anything.
-- ---------------------------------------------------------------------

-- Funnel counts + median completion time (seconds) for the two wizards
-- named in the brief, over the trailing p_days. A session counts as
-- "completed" only if both its _started and _completed events exist —
-- an abandoned attempt (started, never completed) correctly drags the
-- completion rate down rather than being silently excluded.
create or replace function public.platform_get_usage_summary(p_days integer default 30)
returns table (
  new_rental_started bigint,
  new_rental_completed bigint,
  new_rental_median_seconds numeric,
  return_started bigint,
  return_completed bigint,
  return_median_seconds numeric,
  search_opened bigint,
  search_query_run bigint,
  quick_action_used bigint,
  alert_action_used bigint,
  error_occurred bigint,
  import_completed bigint,
  pwa_install_accepted bigint,
  pwa_install_dismissed bigint,
  pwa_installed bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  with recent as (
    select * from public.usage_events where created_at > now() - (p_days || ' days')::interval
  ),
  funnel as (
    select
      session_id,
      max(created_at) filter (where event_type = 'new_rental_started') as nr_started,
      max(created_at) filter (where event_type = 'new_rental_completed') as nr_completed,
      max(created_at) filter (where event_type = 'return_started') as rt_started,
      max(created_at) filter (where event_type = 'return_completed') as rt_completed
    from recent
    where session_id is not null
    group by session_id
  )
  select
    (select count(*) from funnel where nr_started is not null),
    (select count(*) from funnel where nr_started is not null and nr_completed is not null),
    (select percentile_cont(0.5) within group (order by extract(epoch from (nr_completed - nr_started)))
       from funnel where nr_started is not null and nr_completed is not null),
    (select count(*) from funnel where rt_started is not null),
    (select count(*) from funnel where rt_started is not null and rt_completed is not null),
    (select percentile_cont(0.5) within group (order by extract(epoch from (rt_completed - rt_started)))
       from funnel where rt_started is not null and rt_completed is not null),
    (select count(*) from recent where event_type = 'search_opened'),
    (select count(*) from recent where event_type = 'search_query_run'),
    (select count(*) from recent where event_type = 'quick_action_used'),
    (select count(*) from recent where event_type = 'alert_action_used'),
    (select count(*) from recent where event_type = 'error_occurred'),
    (select count(*) from recent where event_type = 'import_completed'),
    (select count(*) from recent where event_type = 'pwa_install_outcome' and metadata ->> 'outcome' = 'accepted'),
    (select count(*) from recent where event_type = 'pwa_install_outcome' and metadata ->> 'outcome' = 'dismissed'),
    (select count(*) from recent where event_type = 'pwa_installed');
end;
$$;

-- Drop-off distribution for one flow ('new_rental' or 'return'): how many
-- attempts (sessions) reached each step, from a stream of
-- '<flow>_step_viewed' events carrying metadata.step (integer, 0-based)
-- and metadata.step_label. A session's "furthest step reached" is what's
-- counted per step, not raw view counts, so re-viewing step 1 twice
-- doesn't inflate step 1's numbers.
create or replace function public.platform_get_dropoff_summary(p_flow text, p_days integer default 30)
returns table (
  step integer,
  step_label text,
  sessions_reached bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  with steps as (
    select
      session_id,
      (metadata ->> 'step')::integer as step,
      metadata ->> 'step_label' as step_label
    from public.usage_events
    where event_type = p_flow || '_step_viewed'
      and created_at > now() - (p_days || ' days')::interval
      and session_id is not null
  ),
  furthest as (
    select session_id, max(step) as furthest_step
    from steps
    group by session_id
  ),
  labels as (
    select distinct step, step_label from steps
  )
  select l.step, l.step_label, count(f.session_id)
  from labels l
  left join furthest f on f.furthest_step >= l.step
  group by l.step, l.step_label
  order by l.step;
end;
$$;

revoke all on function public.platform_get_usage_summary(integer) from public;
revoke all on function public.platform_get_dropoff_summary(text, integer) from public;

grant execute on function public.platform_get_usage_summary(integer) to authenticated;
grant execute on function public.platform_get_dropoff_summary(text, integer) to authenticated;
