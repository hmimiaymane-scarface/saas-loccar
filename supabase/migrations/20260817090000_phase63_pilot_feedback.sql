-- Roadmap phase 63 ("Pilot Onboarding Package"). Brief: prepare the
-- first real agency experience — setup checklist, data import,
-- contract template, owner account, PWA install, a 10-minute
-- walkthrough, a backup contact method for issues, and feedback
-- capture. All but the last two already exist (setup wizard, importer,
-- contract templates, sign-up, install prompt — see
-- docs/pilot-onboarding-package.md for the assembled package). This
-- migration adds the one genuinely new piece of state: a place for a
-- pilot's in-app feedback to land.
--
-- Same "platform operator's own concern, not tenant-visible" framing as
-- usage_events/operational_events (phases 58-59): a company can write
-- its own feedback but never read anyone's, including its own — the
-- founder reads it back via the platform console, the same way a
-- support inbox works. Unlike those two tables this one is genuinely
-- low-volume and human-authored, so no closed CHECK enum or JSONB
-- metadata column is needed — just who said what, from where, and when.
create table public.pilot_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  page_context text,
  created_at timestamptz not null default now()
);

create index pilot_feedback_company_created_idx on public.pilot_feedback (company_id, created_at desc);
create index pilot_feedback_created_idx on public.pilot_feedback (created_at desc);

alter table public.pilot_feedback enable row level security;

-- Any signed-in company member can submit feedback for their own
-- company — no owner/manager gate, unlike most mutations in this app,
-- since "tell us something's wrong" should never require asking a
-- manager first. No SELECT policy for anyone, including the company
-- that wrote it — same "insert allowed, read only via a SECURITY
-- DEFINER function" shape as usage_events/operational_events.
create policy "Members can submit feedback for their own company"
  on public.pilot_feedback for insert
  with check (public.is_company_member(company_id));

-- ---------------------------------------------------------------------
-- Read side, same style as platform_get_recent_operational_events.
-- ---------------------------------------------------------------------

create or replace function public.platform_get_company_feedback(p_company_id uuid, p_limit integer default 20)
returns table (
  id uuid,
  message text,
  page_context text,
  submitted_by_email text,
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
  select pf.id, pf.message, pf.page_context, u.email, pf.created_at
  from public.pilot_feedback pf
  left join auth.users u on u.id = pf.submitted_by
  where pf.company_id = p_company_id
  order by pf.created_at desc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.platform_get_company_feedback(uuid, integer) from public;
grant execute on function public.platform_get_company_feedback(uuid, integer) to authenticated;
