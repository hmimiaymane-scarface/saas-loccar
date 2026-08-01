-- Roadmap phase 64 ("Pilot Feedback Loop"). Brief: "use real owner
-- behavior to guide the final product" — track what a pilot avoids,
-- misunderstands, repeats, still does on paper, still does on WhatsApp
-- outside RentalOS, asks the founder to do for them, hesitates on, and
-- enjoys checking (see lib/platform/product-signals.ts for the fixed
-- vocabulary). "Done when: feedback is converted into ranked product
-- changes, not a random request list" — the ranking is impact x
-- frequency, computed in the read RPC below, not stored redundantly.
--
-- Distinct from phase 63's pilot_feedback on purpose: that table is
-- the PILOT's own words, submitted by them from /support, never
-- readable by the company that wrote it (insert-allowed,
-- read-only-via-RPC). This one is the FOUNDER's own field observation
-- about a pilot, and the founder is the only party on either side of
-- it — so it follows the company_subscriptions/platform_admins
-- pattern instead (RLS enabled, ZERO policies, everything through
-- SECURITY DEFINER functions), not the "company inserts" shape.
create table public.product_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  signal_type text not null check (signal_type in (
    'avoids', 'misunderstands', 'repeats', 'paper_workaround',
    'whatsapp_workaround', 'asked_us_to_do', 'hesitates', 'enjoys'
  )),
  note text not null check (char_length(note) between 1 and 2000),
  impact smallint not null check (impact between 1 and 3),
  frequency smallint not null check (frequency between 1 and 3),
  status text not null default 'open' check (status in ('open', 'planned', 'shipped', 'declined')),
  logged_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_signals_company_idx on public.product_signals (company_id, created_at desc);
-- Drives the ranked list's default sort (impact * frequency desc) —
-- generated so it can't silently drift from the read RPC's own
-- computation of the same value.
create index product_signals_priority_idx on public.product_signals ((impact * frequency) desc);

alter table public.product_signals enable row level security;
-- No policies at all — same "founder-only, zero direct table access"
-- shape as platform_admins/company_subscriptions. Every read and write
-- goes through a SECURITY DEFINER function below.

create or replace function public.platform_log_product_signal(
  p_company_id uuid,
  p_signal_type text,
  p_note text,
  p_impact integer,
  p_frequency integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.assert_platform_admin();

  insert into public.product_signals (company_id, signal_type, note, impact, frequency, logged_by)
  values (p_company_id, p_signal_type, p_note, p_impact, p_frequency, auth.uid())
  returning id into v_id;

  perform public.log_platform_action(p_company_id, 'product_signal_logged', p_signal_type);
  return v_id;
end;
$$;

create or replace function public.platform_update_product_signal_status(
  p_signal_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  perform public.assert_platform_admin();

  update public.product_signals
  set status = p_status, updated_at = now()
  where id = p_signal_id
  returning company_id into v_company_id;

  if not found then
    raise exception 'No product signal with that id.';
  end if;

  perform public.log_platform_action(v_company_id, 'product_signal_status_changed', p_status);
end;
$$;

-- p_company_id/p_status both optional — omit either to see the ranked
-- list across every pilot, or filtered down to one company or one
-- status. This is the "ranked product changes" view the phase brief
-- asks for: sorted by impact * frequency, newest first as the tiebreak.
create or replace function public.platform_get_product_signals(
  p_company_id uuid default null,
  p_status text default null
)
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  signal_type text,
  note text,
  impact smallint,
  frequency smallint,
  priority integer,
  status text,
  logged_by_email text,
  created_at timestamptz,
  updated_at timestamptz
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
    ps.id, ps.company_id, c.name, ps.signal_type, ps.note, ps.impact, ps.frequency,
    (ps.impact * ps.frequency)::integer as priority, ps.status, u.email, ps.created_at, ps.updated_at
  from public.product_signals ps
  join public.companies c on c.id = ps.company_id
  left join auth.users u on u.id = ps.logged_by
  where (p_company_id is null or ps.company_id = p_company_id)
    and (p_status is null or ps.status = p_status)
  order by (ps.impact * ps.frequency) desc, ps.created_at desc;
end;
$$;

revoke all on function public.platform_log_product_signal(uuid, text, text, integer, integer) from public;
revoke all on function public.platform_update_product_signal_status(uuid, text) from public;
revoke all on function public.platform_get_product_signals(uuid, text) from public;

grant execute on function public.platform_log_product_signal(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.platform_update_product_signal_status(uuid, text) to authenticated;
grant execute on function public.platform_get_product_signals(uuid, text) to authenticated;
