-- Roadmap phase 59 ("Error Monitoring and Operational Observability").
-- Brief: "know when the product breaks before the customer explains it."
-- Distinct from phase 58's usage_events (product-usage funnels/behavior)
-- — this is system-health evidence: crashes, failed jobs, failed
-- notifications, failed uploads, and slow routes. Same "platform
-- operator's own concern, not tenant-visible" framing as usage_events,
-- for the same reason: an individual rental company has no use for
-- "how many API routes errored across the whole SaaS this week."
--
-- AI-call failure visibility needed NO new table — `ai_usage_log`
-- (phase 05, 20260726090000) already records a `success boolean` +
-- `error_code` on every askAI() call, written on both the success and
-- failure path (`lib/ai/service.ts#logUsage`). This phase only adds a
-- read (`platform_get_ai_call_summary`) surfacing what already exists.
--
-- `company_id` is nullable — a cron run's own pre-loop failure (e.g.
-- the query listing companies itself fails) or a frontend error before
-- any company context loaded isn't scoped to one tenant.
--
-- `source` is a small closed CHECK enum, not open text like
-- usage_events.event_type — unlike product-usage events (expected to
-- grow new names often), the *categories* of thing that can break are
-- fixed by this phase's own brief and unlikely to grow casually; `context`
-- (free text — a route name, job name, upload field) is where per-call-site
-- specificity goes instead, so a new call site never needs a migration.
create table public.operational_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  source text not null check (source in ('frontend', 'api_route', 'cron_job', 'notification', 'upload', 'slow_route')),
  severity text not null default 'error' check (severity in ('warning', 'error')),
  context text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index operational_events_created_idx on public.operational_events (created_at desc);
create index operational_events_source_created_idx on public.operational_events (source, created_at desc);
create index operational_events_company_created_idx on public.operational_events (company_id, created_at desc) where company_id is not null;

alter table public.operational_events enable row level security;

-- Only a company-scoped member can insert their own company's event —
-- this covers every write path EXCEPT the two that run with no signed-in
-- user at all (the cron jobs), which use the service-role admin client
-- (lib/supabase/admin.ts) instead and bypass RLS entirely by design, the
-- same sanctioned exception that client already documents for exactly
-- this kind of no-session background job. No SELECT policy for anyone —
-- same "insert allowed, read only via a SECURITY DEFINER function"
-- shape as usage_events and platform_admins.
create policy "Members can record operational events"
  on public.operational_events for insert
  with check (public.is_company_member(company_id));

-- ---------------------------------------------------------------------
-- Read side, same style as platform_get_usage_summary
-- (20260815090000_usage_events.sql) — plpgsql so the body can
-- `perform assert_platform_admin()` before returning anything.
-- ---------------------------------------------------------------------

create or replace function public.platform_get_operational_summary(p_days integer default 7)
returns table (
  frontend_errors bigint,
  api_route_errors bigint,
  cron_job_failures bigint,
  notification_failures bigint,
  upload_failures bigint,
  slow_routes bigint
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
    select * from public.operational_events where created_at > now() - (p_days || ' days')::interval
  )
  select
    (select count(*) from recent where source = 'frontend'),
    (select count(*) from recent where source = 'api_route'),
    (select count(*) from recent where source = 'cron_job'),
    (select count(*) from recent where source = 'notification'),
    (select count(*) from recent where source = 'upload'),
    (select count(*) from recent where source = 'slow_route');
end;
$$;

create or replace function public.platform_get_recent_operational_events(p_limit integer default 50)
returns table (
  id uuid,
  company_name text,
  source text,
  severity text,
  context text,
  message text,
  duration_ms integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  select oe.id, c.name, oe.source, oe.severity, oe.context, oe.message, oe.duration_ms, oe.created_at
  from public.operational_events oe
  left join public.companies c on c.id = oe.company_id
  order by oe.created_at desc
  limit greatest(p_limit, 1);
end;
$$;

-- AI-call failure visibility — reads the existing ai_usage_log table
-- (phase 05), no new writes needed.
create or replace function public.platform_get_ai_call_summary(p_days integer default 7)
returns table (
  total_calls bigint,
  failed_calls bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  select
    count(*),
    count(*) filter (where not success)
  from public.ai_usage_log
  where created_at > now() - (p_days || ' days')::interval;
end;
$$;

revoke all on function public.platform_get_operational_summary(integer) from public;
revoke all on function public.platform_get_recent_operational_events(integer) from public;
revoke all on function public.platform_get_ai_call_summary(integer) from public;

grant execute on function public.platform_get_operational_summary(integer) to authenticated;
grant execute on function public.platform_get_recent_operational_events(integer) to authenticated;
grant execute on function public.platform_get_ai_call_summary(integer) to authenticated;
