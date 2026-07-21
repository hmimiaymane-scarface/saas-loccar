-- Roadmap phase 15 ("Guided Pickup/Return Upgrade: AI Damage Detection"),
-- requirement 1: neither a pickup nor a return inspection could be marked
-- complete without an odometer reading and fuel level (see
-- 20260719091100_inspection_lifecycle.sql), but a photo of any angle —
-- including the vehicle's own mileage and fuel gauge — was always
-- optional. This closes that gap at the same layer the other
-- cross-field checks already live in, rather than trusting the app layer
-- alone to remember to ask.
--
-- The required slot keys mirror lib/inspections/photo-slots.ts exactly
-- (front, rear, driver_side, passenger_side, interior,
-- dashboard_odometer, fuel_gauge) — if that list ever changes, this
-- array must change with it. Slot identity is `media.caption`, the same
-- convention pickup-wizard/return-wizard have used since their first
-- version (see lib/operations-feed/thresholds.ts's own note on this).
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

-- Distinguishes an AI-flagged-then-employee-confirmed damage from one
-- entered entirely by hand — 'manual' is the default so every damage
-- ever recorded before this phase reads correctly with no backfill.
-- ai_confidence is only ever set alongside source = 'ai_detected' (not
-- constrained at the DB level, same light-touch style as the rest of
-- this table — the app is the one place that sets both together).
alter table public.damages
  add column source text not null default 'manual' check (source in ('manual', 'ai_detected')),
  add column ai_confidence numeric(5, 2);
