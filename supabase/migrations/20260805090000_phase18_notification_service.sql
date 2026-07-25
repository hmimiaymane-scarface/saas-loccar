-- Phase 18 of the RentalOS build roadmap ("Multi-Channel Notification
-- Platform Service"). This checkpoint lays the schema/service foundation:
-- a single write helper every SQL caller uses (mirroring
-- public.log_activity()'s consolidation role from
-- 20260723090000_event_backbone.sql), and one shared priority vocabulary
-- with the Operations Feed / Business Command Center instead of a second
-- taxonomy (requirement 3 — see components/domain/intelligence/
-- insight-feed-item.tsx's InsightPriority).
--
-- Two real gaps found while auditing the current system before writing
-- this:
--   1. Phase 17's create_approval_request()/resolve_approval_request()
--      each did their own raw `insert into notifications` — exactly the
--      copy-pasted-insert anti-pattern log_activity() already exists to
--      avoid on the activity_log side. Retrofitted onto notify() below.
--   2. Phase 17 added 'approval_requested'/'approval_approved'/
--      'approval_rejected' to this table's `type` CHECK constraint but
--      never added them to the matching NotificationType TS union
--      (types/rental.ts) — fixed in the same commit as this migration.

-- ---------------------------------------------------------------------
-- 1. Priority taxonomy: low|normal|high|urgent -> the shared
--    InsightPriority vocabulary (critical|operational|important|
--    informational). Mapping preserves relative ordering: an overdue
--    item was 'urgent' and becomes 'critical' (needs immediate action);
--    a due-now item was 'high' and becomes 'operational' (today's
--    actionable work); a due-soon item was 'normal' and becomes
--    'important' (a slower-building concern, per that type's own
--    definition); 'low' (never actually emitted by any live alert
--    today) becomes 'informational'.
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint notifications_priority_check;

update public.notifications set priority = case priority
  when 'urgent' then 'critical'
  when 'high' then 'operational'
  when 'normal' then 'important'
  when 'low' then 'informational'
  else priority
end;

alter table public.notifications alter column priority set default 'informational';
alter table public.notifications add constraint notifications_priority_check
  check (priority in ('critical', 'operational', 'important', 'informational'));

-- ---------------------------------------------------------------------
-- 1b. actions: concrete next steps per notification (requirement 2 — the
--     bible's non-negotiable "never 'Vehicle overdue' alone"). A small
--     jsonb array of {label, href, kind}, same "loose bag" convention as
--     activity_log.metadata rather than a normalized child table — this
--     is display data generated fresh by whichever code creates the
--     notification, not something queried/filtered on independently.
-- ---------------------------------------------------------------------
alter table public.notifications add column actions jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 2. notify(): the shared write helper. Not SECURITY DEFINER, for the
--    same reason as log_activity() — every SQL-side caller below is
--    already executing inside a SECURITY DEFINER function (so this runs
--    with that function's elevated context regardless, which is what
--    lets it insert a row for a user other than the caller — see
--    notifications' own RLS insert policy, `user_id = auth.uid()`,
--    which a plain authenticated call could never satisfy for someone
--    else). This function only exists to stop the insert literal from
--    being copy-pasted at every call site.
-- ---------------------------------------------------------------------
create or replace function public.notify(
  p_company_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_description text default null,
  p_link_href text default null,
  p_priority text default 'informational',
  p_key text default null,
  p_actions jsonb default '[]'::jsonb
)
returns uuid
language sql
set search_path = public
as $$
  insert into public.notifications (
    company_id, user_id, type, key, title, description, link_href, priority, actions
  ) values (
    p_company_id, p_user_id, p_type, p_key, p_title, p_description, p_link_href, p_priority, p_actions
  )
  returning id;
$$;

revoke all on function public.notify(uuid, uuid, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.notify(uuid, uuid, text, text, text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Retrofit Phase 17's two raw inserts onto notify().
-- ---------------------------------------------------------------------
create or replace function public.create_approval_request(
  p_company_id uuid,
  p_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_reason text
)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests;
  v_reviewer record;
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'Not a member of this company';
  end if;

  if p_type not in ('large_discount', 'refund', 'contract_amendment', 'vehicle_exchange', 'blacklist_customer') then
    raise exception 'Unknown approval request type: %', p_type;
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required to request approval';
  end if;

  insert into public.approval_requests (company_id, type, entity_type, entity_id, requested_by, payload, reason)
  values (p_company_id, p_type, p_entity_type, p_entity_id, auth.uid(), coalesce(p_payload, '{}'::jsonb), p_reason)
  returning * into v_request;

  for v_reviewer in
    select user_id from public.company_memberships
    where company_id = p_company_id and status = 'active' and role in ('owner', 'manager')
  loop
    perform public.notify(
      p_company_id,
      v_reviewer.user_id,
      'approval_requested',
      'A team member requested approval',
      p_reason,
      '/approvals/' || v_request.id,
      'important',
      'approval_requested:' || v_request.id || ':' || v_reviewer.user_id,
      jsonb_build_array(jsonb_build_object('label', 'Review request', 'href', '/approvals/' || v_request.id, 'kind', 'link'))
    );
  end loop;

  return v_request;
end;
$$;

create or replace function public.resolve_approval_request(
  p_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests;
begin
  select * into v_request from public.approval_requests where id = p_request_id;
  if not found then
    raise exception 'Approval request not found';
  end if;

  if not public.is_company_manager_or_owner(v_request.company_id) then
    raise exception 'Only an owner or manager can resolve an approval request';
  end if;

  if v_request.status != 'pending' then
    raise exception 'This request has already been resolved';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  if p_decision = 'approved' then
    if v_request.type = 'large_discount' then
      update public.reservations
      set discount_percent = (v_request.payload ->> 'discount_percent')::numeric
      where id = (v_request.payload ->> 'reservation_id')::uuid
        and company_id = v_request.company_id;
      if not found then
        raise exception 'Reservation not found for this request';
      end if;

    elsif v_request.type = 'refund' then
      update public.deposits
      set returned_amount = returned_amount + (v_request.payload ->> 'refund_amount')::numeric
      where reservation_id = (v_request.payload ->> 'reservation_id')::uuid
        and company_id = v_request.company_id;
      if not found then
        raise exception 'Deposit not found for this request';
      end if;

    elsif v_request.type = 'contract_amendment' then
      insert into public.contract_amendments (company_id, contract_id, description, created_by)
      values (
        v_request.company_id,
        (v_request.payload ->> 'contract_id')::uuid,
        coalesce(v_request.payload ->> 'description', p_reason),
        auth.uid()
      );

    elsif v_request.type = 'vehicle_exchange' then
      update public.reservations
      set vehicle_id = (v_request.payload ->> 'new_vehicle_id')::uuid
      where id = (v_request.payload ->> 'reservation_id')::uuid
        and company_id = v_request.company_id;
      if not found then
        raise exception 'Reservation not found for this request';
      end if;

    elsif v_request.type = 'blacklist_customer' then
      update public.customers
      set status = 'blocked'
      where id = (v_request.payload ->> 'customer_id')::uuid
        and company_id = v_request.company_id;
      if not found then
        raise exception 'Customer not found for this request';
      end if;

    else
      raise exception 'Unknown approval request type: %', v_request.type;
    end if;
  end if;

  update public.approval_requests
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), reason = p_reason
  where id = p_request_id
  returning * into v_request;

  -- Resolve the original "someone requested approval" notifications sent
  -- to every manager/owner at request time — otherwise they sit there
  -- forever even though the thing they're about is no longer pending,
  -- exactly the staleness this phase exists to eliminate (requirement 5).
  -- Their dismissal-marker-style key (see the notifications table's own
  -- comment on why a `key` addresses a specific alert) makes them
  -- findable without a new column.
  update public.notifications
  set read_at = now()
  where key like 'approval_requested:' || v_request.id || ':%'
    and read_at is null;

  perform public.notify(
    v_request.company_id,
    v_request.requested_by,
    case when p_decision = 'approved' then 'approval_approved' else 'approval_rejected' end,
    case when p_decision = 'approved' then 'Your request was approved' else 'Your request was rejected' end,
    p_reason,
    '/approvals/' || v_request.id,
    'important',
    null,
    jsonb_build_array(jsonb_build_object('label', 'View request', 'href', '/approvals/' || v_request.id, 'kind', 'link'))
  );

  return v_request;
end;
$$;
