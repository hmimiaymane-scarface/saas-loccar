-- Roadmap phase 25 ("Pickup Inspection Workflow"). Odometer, fuel level,
-- and every required photo angle already block completion (see
-- 20260719091100_inspection_lifecycle.sql and
-- 20260802090000_inspection_photo_completeness.sql) — but an employee
-- could complete a pickup having never actually looked at the vehicle's
-- existing damage list with the customer, which is exactly the kind of
-- evidence a later dispute ("that scratch was already there") turns on.
-- Same enforcement layer as the other two, not left to app-layer memory.
--
-- Pickup-only: a return inspection is about damage found DURING the
-- rental (roadmap phases 28/29's AI comparison flow), not a re-review of
-- pre-existing damage, so this column is simply unused (default false,
-- harmless) on a return row.
alter table public.inspections
  add column existing_damage_reviewed boolean not null default false;

create or replace function public.complete_inspection(p_inspection_id uuid)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inspection public.inspections;
  v_pickup public.inspections;
  v_reservation public.reservations;
  v_required_slots text[] := array['front', 'rear', 'driver_side', 'passenger_side', 'interior', 'dashboard_odometer', 'fuel_gauge'];
  v_captured_slots text[];
  v_missing_slots text[];
begin
  select * into v_inspection from public.inspections where id = p_inspection_id;
  if v_inspection is null then
    raise exception 'Inspection not found';
  end if;

  if public.company_role(v_inspection.company_id) not in ('owner', 'manager', 'agent') then
    raise exception 'Not permitted to complete this inspection';
  end if;

  if v_inspection.status = 'completed' then
    raise exception 'This inspection is already completed';
  end if;

  if v_inspection.odometer_km is null or v_inspection.fuel_level is null then
    raise exception 'Odometer and fuel level are required to complete an inspection';
  end if;

  if v_inspection.type = 'pickup' and not v_inspection.existing_damage_reviewed then
    raise exception 'Confirm the existing damage review before completing a pickup inspection';
  end if;

  select array_agg(distinct caption) into v_captured_slots
    from public.media
    where entity_type = 'inspection' and entity_id = p_inspection_id and caption is not null;

  select array_agg(slot) into v_missing_slots
    from unnest(v_required_slots) as slot
    where v_captured_slots is null or not (slot = any(v_captured_slots));

  if v_missing_slots is not null and array_length(v_missing_slots, 1) > 0 then
    raise exception 'Missing required photos: %', array_to_string(v_missing_slots, ', ');
  end if;

  select * into v_reservation from public.reservations where id = v_inspection.reservation_id;

  if v_inspection.type = 'return' then
    if v_reservation.status <> 'active' then
      raise exception 'A return inspection can only be completed for an active rental';
    end if;

    select * into v_pickup from public.inspections
      where reservation_id = v_inspection.reservation_id and type = 'pickup';

    if v_pickup is not null and v_pickup.odometer_km is not null
       and v_inspection.odometer_km < v_pickup.odometer_km then
      raise exception 'Return odometer (%) cannot be lower than the pickup odometer (%)',
        v_inspection.odometer_km, v_pickup.odometer_km;
    end if;
  end if;

  update public.inspections
  set status = 'completed', completed_at = now(), performed_by = coalesce(performed_by, auth.uid())
  where id = p_inspection_id
  returning * into v_inspection;

  -- Keep the vehicle's live odometer current — never move it backwards.
  update public.vehicles
  set odometer_km = v_inspection.odometer_km
  where id = v_inspection.vehicle_id and odometer_km < v_inspection.odometer_km;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_inspection.company_id,
    auth.uid(),
    'inspection_completed',
    initcap(v_inspection.type) || ' inspection completed',
    null,
    jsonb_build_object('reservation_id', v_inspection.reservation_id, 'inspection_id', p_inspection_id)
  );

  return v_inspection;
end;
$$;
