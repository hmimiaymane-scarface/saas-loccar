-- Starting an inspection (pickup or return) is just an ordinary insert
-- under RLS — the `unique (reservation_id, type)` constraint on
-- `inspections` is what stops a duplicate pickup inspection from ever
-- existing, no extra function needed for that rule.
--
-- Completing one goes through this function so the cross-field checks the
-- brief calls out are enforced in one place, not duplicated in the app
-- layer and hopefully-also in the database.
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

revoke all on function public.complete_inspection(uuid) from public;
grant execute on function public.complete_inspection(uuid) to authenticated;

-- Controlled correction of a completed inspection (see docs/security.md
-- and the phase brief's "Controlled corrections" section). RLS already
-- blocks ordinary UPDATEs once status = 'completed' — this is the one
-- sanctioned bypass, restricted to owner/manager, and always requires a
-- reason that gets logged.
create or replace function public.correct_inspection(
  p_inspection_id uuid,
  p_reason text,
  p_odometer_km integer default null,
  p_fuel_level text default null,
  p_cleanliness text default null,
  p_overall_condition text default null,
  p_notes text default null
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inspection public.inspections;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to correct a completed inspection';
  end if;

  select * into v_inspection from public.inspections where id = p_inspection_id;
  if v_inspection is null then
    raise exception 'Inspection not found';
  end if;

  if public.company_role(v_inspection.company_id) not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can correct a completed inspection';
  end if;

  if v_inspection.status <> 'completed' then
    raise exception 'Only a completed inspection can be corrected — edit a draft directly instead';
  end if;

  update public.inspections
  set
    odometer_km = coalesce(p_odometer_km, odometer_km),
    fuel_level = coalesce(p_fuel_level, fuel_level),
    cleanliness = coalesce(p_cleanliness, cleanliness),
    overall_condition = coalesce(p_overall_condition, overall_condition),
    notes = coalesce(p_notes, notes),
    correction_reason = p_reason,
    corrected_by = auth.uid(),
    corrected_at = now()
  where id = p_inspection_id
  returning * into v_inspection;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_inspection.company_id,
    auth.uid(),
    'inspection_corrected',
    initcap(v_inspection.type) || ' inspection corrected',
    p_reason,
    jsonb_build_object('reservation_id', v_inspection.reservation_id, 'inspection_id', p_inspection_id)
  );

  return v_inspection;
end;
$$;

revoke all on function public.correct_inspection(uuid, text, integer, text, text, text, text) from public;
grant execute on function public.correct_inspection(uuid, text, integer, text, text, text, text) to authenticated;
