-- Roadmap phase 17 — resolve_approval_request(): the single RPC that
-- reviews an approval_requests row and, on approval, performs the side
-- effect itself. Unlike the AI proposal flow (lib/ai/tools.ts's
-- createProposal -> confirmProposedAction, which replays a stored
-- payload through the same real server action a human would call), an
-- employee-initiated approval request cannot be replayed through the
-- requester's own action — they lack the underlying permission by
-- definition, so their own action call would just reject them. This RPC
-- is SECURITY DEFINER and owner/manager-gated instead, and applies each
-- payload shape directly. Written but, per this project's standing
-- rule, NOT applied to the live Supabase project from this session.
--
-- Payload shapes per type (validated below, not just assumed):
--   large_discount:     { reservation_id, discount_amount }
--   refund:              { reservation_id, amount, method, notes? }
--   contract_amendment: { contract_id, type, description, changes? }
--   vehicle_exchange:   { reservation_id, new_vehicle_id }
--   blacklist_customer: { customer_id }

create or replace function public.resolve_approval_request(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns public.approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.approval_requests;
  v_actor_role text;
  v_customer_id uuid;
begin
  select * into v_request from public.approval_requests where id = p_request_id;
  if v_request is null then
    raise exception 'Approval request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  v_actor_role := public.company_role(v_request.company_id);
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'Not permitted to review approval requests';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required to approve or reject a request';
  end if;

  if p_decision = 'approved' then
    if v_request.type = 'large_discount' then
      update public.reservations
      set discount_amount = (v_request.payload ->> 'discount_amount')::numeric
      where id = (v_request.payload ->> 'reservation_id')::uuid
        and company_id = v_request.company_id;
      if not found then
        raise exception 'Reservation not found for this request';
      end if;

    elsif v_request.type = 'refund' then
      select customer_id into v_customer_id
      from public.reservations
      where id = (v_request.payload ->> 'reservation_id')::uuid
        and company_id = v_request.company_id;
      if v_customer_id is null then
        raise exception 'Reservation not found for this request';
      end if;

      insert into public.payments (company_id, reservation_id, customer_id, transaction_type, amount, method, notes, recorded_by)
      values (
        v_request.company_id,
        (v_request.payload ->> 'reservation_id')::uuid,
        v_customer_id,
        'refund',
        (v_request.payload ->> 'amount')::numeric,
        coalesce(v_request.payload ->> 'method', 'cash'),
        v_request.payload ->> 'notes',
        auth.uid()
      );

    elsif v_request.type = 'contract_amendment' then
      insert into public.contract_amendments (company_id, contract_id, type, description, changes, created_by)
      values (
        v_request.company_id,
        (v_request.payload ->> 'contract_id')::uuid,
        v_request.payload ->> 'type',
        coalesce(v_request.payload ->> 'description', v_request.reason),
        coalesce(v_request.payload -> 'changes', '[]'::jsonb),
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

  insert into public.notifications (company_id, user_id, type, title, description, link_href, priority)
  values (
    v_request.company_id,
    v_request.requested_by,
    case when p_decision = 'approved' then 'approval_approved' else 'approval_rejected' end,
    case when p_decision = 'approved' then 'Your request was approved' else 'Your request was rejected' end,
    p_reason,
    '/approvals/' || v_request.id,
    'normal'
  );

  return v_request;
end;
$$;

revoke all on function public.resolve_approval_request(uuid, text, text) from public;
grant execute on function public.resolve_approval_request(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- create_approval_request(): the employee-facing side. Any active
-- member can request one; unlike resolve_approval_request this has no
-- role gate of its own — has_permission() at the RLS layer already
-- decides whether someone can act directly (no request needed) versus
-- needing to ask, so this RPC doesn't duplicate that judgment. It just
-- validates the type and notifies owners/managers.
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
    insert into public.notifications (company_id, user_id, type, title, description, link_href, priority)
    values (p_company_id, v_reviewer.user_id, 'approval_requested', 'A team member requested approval', p_reason, '/approvals/' || v_request.id, 'normal');
  end loop;

  return v_request;
end;
$$;

revoke all on function public.create_approval_request(uuid, text, text, uuid, jsonb, text) from public;
grant execute on function public.create_approval_request(uuid, text, text, uuid, jsonb, text) to authenticated;
