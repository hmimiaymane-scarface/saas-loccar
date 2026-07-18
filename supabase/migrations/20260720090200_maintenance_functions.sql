-- Centralizes every maintenance transition that also has to touch
-- vehicles.status (and, on completion, expenses) so those two-table
-- updates happen atomically and the rules from the phase brief live in
-- one place instead of being re-implemented per call site:
--   - An active rental blocks entering maintenance through the normal
--     flow (mirrors the existing check in updateVehicleStatus()).
--   - Completing maintenance requires an explicit next vehicle status,
--     never an inferred one (same principle as complete_rental()).
--   - A completed maintenance record creates at most one linked expense
--     (the partial unique index on expenses.maintenance_record_id is the
--     hard guarantee; this function is what makes that the normal path).

create or replace function public.assert_no_active_rental(p_vehicle_id uuid, p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active public.reservations;
begin
  select * into v_active
  from public.reservations
  where vehicle_id = p_vehicle_id and company_id = p_company_id and status = 'active';

  if v_active is not null then
    raise exception 'This vehicle has an active rental (%). Complete or manage the return before changing its status.',
      v_active.reference;
  end if;
end;
$$;

revoke all on function public.assert_no_active_rental(uuid, uuid) from public;
grant execute on function public.assert_no_active_rental(uuid, uuid) to authenticated;

create or replace function public.create_maintenance(
  p_vehicle_id uuid,
  p_type text,
  p_priority text,
  p_status text,
  p_description text default null,
  p_scheduled_on date default null,
  p_odometer_km integer default null,
  p_estimated_cost numeric default null,
  p_supplier text default null,
  p_notes text default null
)
returns public.maintenance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_record public.maintenance_records;
begin
  select company_id into v_company_id from public.vehicles where id = p_vehicle_id;
  if v_company_id is null then
    raise exception 'Vehicle not found';
  end if;

  if public.company_role(v_company_id) not in ('owner', 'manager') then
    raise exception 'Not permitted to record maintenance';
  end if;

  if p_status in ('in_progress', 'waiting_for_parts') then
    perform public.assert_no_active_rental(p_vehicle_id, v_company_id);
  end if;

  insert into public.maintenance_records (
    company_id, vehicle_id, type, priority, status, description, scheduled_on,
    started_on, odometer_km, estimated_cost, supplier, notes, created_by
  ) values (
    v_company_id, p_vehicle_id, p_type, p_priority, p_status, p_description, p_scheduled_on,
    case when p_status in ('in_progress', 'waiting_for_parts') then current_date else null end,
    p_odometer_km, p_estimated_cost, p_supplier, p_notes, auth.uid()
  )
  returning * into v_record;

  if p_status in ('in_progress', 'waiting_for_parts') then
    update public.vehicles set status = 'maintenance' where id = p_vehicle_id;
  end if;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_company_id,
    auth.uid(),
    case when p_status in ('in_progress', 'waiting_for_parts') then 'vehicle_entered_maintenance' else 'maintenance_scheduled' end,
    initcap(replace(p_type, '_', ' ')) || ' recorded',
    p_description,
    jsonb_build_object('vehicle_id', p_vehicle_id, 'maintenance_id', v_record.id)
  );

  return v_record;
end;
$$;

revoke all on function public.create_maintenance(uuid, text, text, text, text, date, integer, numeric, text, text) from public;
grant execute on function public.create_maintenance(uuid, text, text, text, text, date, integer, numeric, text, text) to authenticated;

create or replace function public.start_maintenance(p_maintenance_id uuid)
returns public.maintenance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.maintenance_records;
begin
  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if v_record is null then
    raise exception 'Maintenance record not found';
  end if;

  if public.company_role(v_record.company_id) not in ('owner', 'manager') then
    raise exception 'Not permitted to update maintenance';
  end if;

  if v_record.status not in ('planned', 'scheduled') then
    raise exception 'Only a planned or scheduled item can be started (currently %)', v_record.status;
  end if;

  perform public.assert_no_active_rental(v_record.vehicle_id, v_record.company_id);

  update public.maintenance_records
  set status = 'in_progress', started_on = coalesce(started_on, current_date)
  where id = p_maintenance_id
  returning * into v_record;

  update public.vehicles set status = 'maintenance' where id = v_record.vehicle_id;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_record.company_id,
    auth.uid(),
    'vehicle_entered_maintenance',
    initcap(replace(v_record.type, '_', ' ')) || ' started',
    null,
    jsonb_build_object('vehicle_id', v_record.vehicle_id, 'maintenance_id', v_record.id)
  );

  return v_record;
end;
$$;

revoke all on function public.start_maintenance(uuid) from public;
grant execute on function public.start_maintenance(uuid) to authenticated;

-- Completing maintenance: the vehicle's next status is an explicit
-- argument (never inferred), and at most one expense is ever linked —
-- if a linked expense already exists (e.g. the owner recorded it by hand
-- first), this call updates its amount instead of creating a duplicate.
create or replace function public.complete_maintenance(
  p_maintenance_id uuid,
  p_vehicle_outcome text,
  p_actual_cost numeric default null,
  p_next_service_on date default null,
  p_next_service_odometer_km integer default null,
  p_create_expense boolean default true
)
returns public.maintenance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.maintenance_records;
  v_existing_expense_id uuid;
begin
  if p_vehicle_outcome not in ('available', 'maintenance', 'unavailable') then
    raise exception 'Invalid vehicle outcome: %', p_vehicle_outcome;
  end if;

  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if v_record is null then
    raise exception 'Maintenance record not found';
  end if;

  if public.company_role(v_record.company_id) not in ('owner', 'manager') then
    raise exception 'Not permitted to complete maintenance';
  end if;

  if v_record.status = 'completed' then
    raise exception 'This maintenance record is already completed';
  end if;

  update public.maintenance_records
  set
    status = 'completed',
    completed_on = current_date,
    actual_cost = coalesce(p_actual_cost, actual_cost),
    next_service_on = p_next_service_on,
    next_service_odometer_km = p_next_service_odometer_km
  where id = p_maintenance_id
  returning * into v_record;

  update public.vehicles set status = p_vehicle_outcome where id = v_record.vehicle_id;

  -- Never move the odometer backwards.
  if v_record.odometer_km is not null then
    update public.vehicles
    set odometer_km = v_record.odometer_km
    where id = v_record.vehicle_id and odometer_km < v_record.odometer_km;
  end if;

  if p_create_expense and v_record.actual_cost is not null and v_record.actual_cost > 0 then
    select id into v_existing_expense_id
    from public.expenses
    where maintenance_record_id = p_maintenance_id;

    if v_existing_expense_id is not null then
      update public.expenses set amount = v_record.actual_cost where id = v_existing_expense_id;
    else
      insert into public.expenses (
        company_id, vehicle_id, maintenance_record_id, category, amount,
        expense_date, supplier, description, recorded_by
      ) values (
        v_record.company_id, v_record.vehicle_id, p_maintenance_id, 'maintenance', v_record.actual_cost,
        current_date, v_record.supplier, initcap(replace(v_record.type, '_', ' ')) || ' maintenance', auth.uid()
      );
    end if;
  end if;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_record.company_id,
    auth.uid(),
    'maintenance_completed',
    initcap(replace(v_record.type, '_', ' ')) || ' completed',
    null,
    jsonb_build_object('vehicle_id', v_record.vehicle_id, 'maintenance_id', v_record.id)
  );

  return v_record;
end;
$$;

revoke all on function public.complete_maintenance(uuid, text, numeric, date, integer, boolean) from public;
grant execute on function public.complete_maintenance(uuid, text, numeric, date, integer, boolean) to authenticated;

-- Cancelling: if the record was already occupying the vehicle
-- (in_progress / waiting_for_parts), the vehicle needs an explicit next
-- status too — otherwise it'd be left silently stuck on "maintenance".
-- A still-planned/scheduled record never touched the vehicle, so no
-- outcome is required.
create or replace function public.cancel_maintenance(
  p_maintenance_id uuid,
  p_vehicle_outcome text default null
)
returns public.maintenance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.maintenance_records;
  v_was_occupying boolean;
begin
  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if v_record is null then
    raise exception 'Maintenance record not found';
  end if;

  if public.company_role(v_record.company_id) not in ('owner', 'manager') then
    raise exception 'Not permitted to cancel maintenance';
  end if;

  if v_record.status = 'completed' then
    raise exception 'A completed maintenance record cannot be cancelled';
  end if;

  v_was_occupying := v_record.status in ('in_progress', 'waiting_for_parts');

  if v_was_occupying and p_vehicle_outcome is null then
    raise exception 'Choose what happens to the vehicle before cancelling this maintenance';
  end if;

  if p_vehicle_outcome is not null and p_vehicle_outcome not in ('available', 'maintenance', 'unavailable') then
    raise exception 'Invalid vehicle outcome: %', p_vehicle_outcome;
  end if;

  update public.maintenance_records
  set status = 'cancelled'
  where id = p_maintenance_id
  returning * into v_record;

  if v_was_occupying then
    update public.vehicles set status = p_vehicle_outcome where id = v_record.vehicle_id;
  end if;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_record.company_id,
    auth.uid(),
    'maintenance_cancelled',
    initcap(replace(v_record.type, '_', ' ')) || ' cancelled',
    null,
    jsonb_build_object('vehicle_id', v_record.vehicle_id, 'maintenance_id', v_record.id)
  );

  return v_record;
end;
$$;

revoke all on function public.cancel_maintenance(uuid, text) from public;
grant execute on function public.cancel_maintenance(uuid, text) to authenticated;
