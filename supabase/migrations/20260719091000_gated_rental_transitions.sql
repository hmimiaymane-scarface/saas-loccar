-- Replaces the previous phase's unconditional confirmed->active and
-- active->completed transitions with requirement-gated functions. A
-- rental should not become active or completed "casually" — see the
-- phase brief's "Starting a rental" / "Completing a rental" sections.
--
-- transition_reservation_status() no longer accepts 'active' or
-- 'completed' as a target at all — those states are only reachable
-- through activate_rental() / complete_rental() below. Per the brief,
-- "Active rentals cannot be cancelled through an ordinary cancel action"
-- either, so 'active' now has no generic outbound transitions.
create or replace function public.transition_reservation_status(
  p_reservation_id uuid,
  p_next_status text
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_allowed text[];
begin
  select * into v_reservation from public.reservations where id = p_reservation_id;
  if v_reservation is null then
    raise exception 'Reservation not found';
  end if;

  if public.company_role(v_reservation.company_id) not in ('owner', 'manager', 'agent') then
    raise exception 'Not permitted to change reservation status';
  end if;

  v_allowed := case v_reservation.status
    when 'request' then array['pending', 'confirmed', 'cancelled']
    when 'pending' then array['confirmed', 'cancelled']
    when 'confirmed' then array['cancelled', 'no_show']
    else array[]::text[]
  end;

  if not (p_next_status = any(v_allowed)) then
    raise exception 'Cannot move a % reservation to % this way', v_reservation.status, p_next_status;
  end if;

  update public.reservations
  set status = p_next_status
  where id = p_reservation_id
  returning * into v_reservation;

  if v_reservation.vehicle_id is not null then
    if p_next_status in ('confirmed', 'pending') then
      update public.vehicles set status = 'reserved' where id = v_reservation.vehicle_id and status = 'available';
    elsif p_next_status in ('cancelled', 'no_show') then
      update public.vehicles set status = 'available' where id = v_reservation.vehicle_id and status in ('reserved', 'rented');
    end if;
  end if;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_reservation.company_id,
    auth.uid(),
    case p_next_status
      when 'confirmed' then 'reservation_confirmed'
      else 'reservation_status_changed'
    end,
    'Reservation ' || v_reservation.reference || ' ' || p_next_status,
    null,
    jsonb_build_object('reservation_id', p_reservation_id)
  );

  return v_reservation;
end;
$$;

-- Starting a rental: requires an assigned vehicle and a completed pickup
-- inspection. Owner/manager may override a missing/incomplete inspection
-- with a mandatory reason; agents follow the normal workflow.
create or replace function public.activate_rental(
  p_reservation_id uuid,
  p_override_reason text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_role text;
  v_pickup_inspection public.inspections;
begin
  select * into v_reservation from public.reservations where id = p_reservation_id;
  if v_reservation is null then
    raise exception 'Reservation not found';
  end if;

  v_role := public.company_role(v_reservation.company_id);
  if v_role not in ('owner', 'manager', 'agent') then
    raise exception 'Not permitted to activate this rental';
  end if;

  if v_reservation.status not in ('confirmed', 'pending') then
    raise exception 'Only a confirmed or pending reservation can be activated (currently %)', v_reservation.status;
  end if;

  if v_reservation.vehicle_id is null then
    raise exception 'Assign a vehicle before starting the rental';
  end if;

  select * into v_pickup_inspection
  from public.inspections
  where reservation_id = p_reservation_id and type = 'pickup';

  if v_pickup_inspection is null or v_pickup_inspection.status <> 'completed' then
    if v_role not in ('owner', 'manager') then
      raise exception 'A completed pickup inspection is required before starting the rental';
    end if;
    if p_override_reason is null or btrim(p_override_reason) = '' then
      raise exception 'An override reason is required to activate without a completed pickup inspection';
    end if;
  end if;

  update public.reservations
  set status = 'active'
  where id = p_reservation_id
  returning * into v_reservation;

  update public.vehicles set status = 'rented' where id = v_reservation.vehicle_id;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_reservation.company_id,
    auth.uid(),
    'vehicle_picked_up',
    'Rental activated: ' || v_reservation.reference,
    case
      when p_override_reason is not null then 'Activated without a completed pickup inspection — override: ' || p_override_reason
      else 'Pickup inspection completed and rental activated'
    end,
    jsonb_build_object('reservation_id', p_reservation_id)
  );

  return v_reservation;
end;
$$;

-- Completing a rental: requires a completed return inspection and the
-- rental balance resolved (or an owner/manager override with reason for
-- either). The vehicle's next operational status is an explicit choice,
-- not inferred, so a newly damaged vehicle never silently becomes
-- available again.
create or replace function public.complete_rental(
  p_reservation_id uuid,
  p_vehicle_outcome text,
  p_override_reason text default null
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_role text;
  v_return_inspection public.inspections;
begin
  if p_vehicle_outcome not in ('available', 'maintenance', 'unavailable') then
    raise exception 'Invalid vehicle outcome: %', p_vehicle_outcome;
  end if;

  select * into v_reservation from public.reservations where id = p_reservation_id;
  if v_reservation is null then
    raise exception 'Reservation not found';
  end if;

  v_role := public.company_role(v_reservation.company_id);
  if v_role not in ('owner', 'manager', 'agent') then
    raise exception 'Not permitted to complete this rental';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'Only an active rental can be completed (currently %)', v_reservation.status;
  end if;

  select * into v_return_inspection
  from public.inspections
  where reservation_id = p_reservation_id and type = 'return';

  if v_return_inspection is null or v_return_inspection.status <> 'completed' then
    if v_role not in ('owner', 'manager') then
      raise exception 'A completed return inspection is required before completing the rental';
    end if;
    if p_override_reason is null or btrim(p_override_reason) = '' then
      raise exception 'An override reason is required to complete without a completed return inspection';
    end if;
  end if;

  if v_reservation.amount_paid < v_reservation.total_amount and v_role not in ('owner', 'manager') then
    raise exception 'The outstanding balance must be resolved, or an owner/manager must authorize completion';
  end if;

  update public.reservations
  set status = 'completed'
  where id = p_reservation_id
  returning * into v_reservation;

  if v_reservation.vehicle_id is not null then
    update public.vehicles set status = p_vehicle_outcome where id = v_reservation.vehicle_id;
  end if;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_reservation.company_id,
    auth.uid(),
    'vehicle_returned',
    'Rental completed: ' || v_reservation.reference,
    case
      when p_override_reason is not null then 'Completed without a completed return inspection — override: ' || p_override_reason
      else 'Return inspection completed and rental closed'
    end,
    jsonb_build_object('reservation_id', p_reservation_id)
  );

  return v_reservation;
end;
$$;

revoke all on function public.activate_rental(uuid, text) from public;
grant execute on function public.activate_rental(uuid, text) to authenticated;
revoke all on function public.complete_rental(uuid, text, text) from public;
grant execute on function public.complete_rental(uuid, text, text) to authenticated;
