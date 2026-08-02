-- Roadmap phase 66 ("Launch Performance Gate"). Brief: "set hard
-- technical launch standards" — define acceptable targets for home
-- load, search, calendar, New Rental step transitions, photo upload,
-- return workflow, contract generation, error rate, background jobs.
-- "Done when: performance has measurable acceptance criteria."
--
-- Most of these targets are already measurable with existing
-- infrastructure (phase 58's usage_events funnel timing, phase 59's
-- operational_events/ai_usage_log) — see docs/launch-performance-gate.md
-- for the full mapping. Three named areas had a genuine, real gap:
-- search, photo upload, and contract generation had no latency signal
-- at all (only upload *failures* were logged, phase 59). This
-- migration closes the search and contract-generation halves of that
-- gap by extending operational_events.source's closed enum with two
-- new categories — photo upload reuses the existing 'upload' source
-- instead (a slow upload and a failed upload are both still "something
-- wrong with an upload," the same category the dashboard already
-- reports on).
alter table public.operational_events drop constraint operational_events_source_check;
alter table public.operational_events add constraint operational_events_source_check
  check (source in ('frontend', 'api_route', 'cron_job', 'notification', 'upload', 'slow_route', 'contract_generation', 'search'));

-- Read side: extend the existing operational summary to report the
-- new category alongside the six phase-59 already tracked, same
-- style as that migration's own platform_get_operational_summary.
create or replace function public.platform_get_operational_summary(p_days integer default 7)
returns table (
  frontend_errors bigint,
  api_route_errors bigint,
  cron_job_failures bigint,
  notification_failures bigint,
  upload_failures bigint,
  slow_routes bigint,
  slow_contract_generations bigint,
  slow_searches bigint
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
    (select count(*) from recent where source = 'upload' and severity = 'error'),
    (select count(*) from recent where source = 'slow_route'),
    (select count(*) from recent where source = 'contract_generation'),
    (select count(*) from recent where source = 'search');
end;
$$;

revoke all on function public.platform_get_operational_summary(integer) from public;
grant execute on function public.platform_get_operational_summary(integer) to authenticated;
