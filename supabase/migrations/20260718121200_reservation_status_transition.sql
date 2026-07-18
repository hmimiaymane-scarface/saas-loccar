-- Centralizes reservation status changes and their vehicle side effects so
-- no interface can push a reservation into an impossible state or forget
-- to update the vehicle. This is the ONLY sanctioned way to change
-- reservation.status after creation — application code should never issue
-- a raw `update reservations set status = ...`.
--
-- Transition table (documented once, enforced here):
--   request    -> pending, confirmed, cancelled
--   pending    -> confirmed, cancelled
--   confirmed  -> active, cancelled, no_show
--   active     -> completed, cancelled
--   completed, cancelled, no_show -> (terminal, no further transitions)
--
-- Vehicle side effects (only when a vehicle is assigned):
--   -> active               : vehicle becomes 'rented'
--   active -> completed     : vehicle becomes 'available' (only if it was
--                              'rented' — never overrides maintenance/
--                              unavailable set independently)
--   -> confirmed / pending  : vehicle becomes 'reserved' (only if it was
--                              'available' — a quick-glance cue on Fleet)
--   -> cancelled / no_show  : vehicle reverts to 'available' if it was
--                              'reserved' or 'rented' because of this
--                              reservation
--
-- SECURITY DEFINER: an agent is allowed to transition a reservation and,
-- as a consequence, flip the vehicle's status — but agents don't have
-- direct UPDATE rights on `vehicles` (see row_level_security.sql). This
-- function checks the caller's role itself rather than relying on table
-- RLS, which is exactly the case RLS can't express (a narrow, specific
-- side effect vs. blanket table access).
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
    when 'confirmed' then array['active', 'cancelled', 'no_show']
    when 'active' then array['completed', 'cancelled']
    else array[]::text[]
  end;

  if not (p_next_status = any(v_allowed)) then
    raise exception 'Cannot move a % reservation to %', v_reservation.status, p_next_status;
  end if;

  update public.reservations
  set status = p_next_status
  where id = p_reservation_id
  returning * into v_reservation;

  if v_reservation.vehicle_id is not null then
    if p_next_status = 'active' then
      update public.vehicles set status = 'rented' where id = v_reservation.vehicle_id;
    elsif p_next_status = 'completed' then
      update public.vehicles set status = 'available' where id = v_reservation.vehicle_id and status = 'rented';
    elsif p_next_status in ('confirmed', 'pending') then
      update public.vehicles set status = 'reserved' where id = v_reservation.vehicle_id and status = 'available';
    elsif p_next_status in ('cancelled', 'no_show') then
      update public.vehicles set status = 'available' where id = v_reservation.vehicle_id and status in ('reserved', 'rented');
    end if;
  end if;

  insert into public.activity_log (company_id, actor_id, type, title, description)
  values (
    v_reservation.company_id,
    auth.uid(),
    case p_next_status
      when 'confirmed' then 'reservation_confirmed'
      when 'active' then 'vehicle_picked_up'
      when 'completed' then 'vehicle_returned'
      else 'reservation_status_changed'
    end,
    'Reservation ' || v_reservation.reference || ' ' || p_next_status,
    null
  );

  return v_reservation;
end;
$$;

revoke all on function public.transition_reservation_status(uuid, text) from public;
grant execute on function public.transition_reservation_status(uuid, text) to authenticated;
