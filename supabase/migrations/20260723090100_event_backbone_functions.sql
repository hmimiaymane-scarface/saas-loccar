-- Phase 01 continued: replaces the 14 raw `insert into public.activity_log`
-- literals scattered across five earlier migrations with calls to
-- public.log_activity() (see 20260723090000_event_backbone.sql), adding
-- entity_type/entity_id per function. CREATE OR REPLACE with identical
-- signatures — every existing grant, call site, and business rule is
-- untouched; only how each function records its activity event changes.

-- ---------------------------------------------------------------------
-- transition_reservation_status — now distinguishes a cancellation from
-- the generic reservation_status_changed bucket it used to fall into.
-- ---------------------------------------------------------------------
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

  perform public.log_activity(
    v_reservation.company_id,
    auth.uid(),
    case p_next_status
      when 'confirmed' then 'reservation_confirmed'
      when 'cancelled' then 'reservation_cancelled'
      else 'reservation_status_changed'
    end,
    'reservation',
    p_reservation_id,
    'Reservation ' || v_reservation.reference || ' ' || p_next_status,
    null,
    jsonb_build_object('reservation_id', p_reservation_id)
  );

  return v_reservation;
end;
$$;

-- ---------------------------------------------------------------------
-- activate_rental / complete_rental — reservation-lifecycle events, so
-- entity_type stays 'reservation' (consistent with reservation_confirmed
-- etc.), with vehicle_id now also carried in metadata since it's readily
-- available and useful for a future vehicle-scoped view.
-- ---------------------------------------------------------------------
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

  perform public.log_activity(
    v_reservation.company_id,
    auth.uid(),
    'vehicle_picked_up',
    'reservation',
    p_reservation_id,
    'Rental activated: ' || v_reservation.reference,
    case
      when p_override_reason is not null then 'Activated without a completed pickup inspection — override: ' || p_override_reason
      else 'Pickup inspection completed and rental activated'
    end,
    jsonb_build_object('reservation_id', p_reservation_id, 'vehicle_id', v_reservation.vehicle_id)
  );

  return v_reservation;
end;
$$;

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

  perform public.log_activity(
    v_reservation.company_id,
    auth.uid(),
    'vehicle_returned',
    'reservation',
    p_reservation_id,
    'Rental completed: ' || v_reservation.reference,
    case
      when p_override_reason is not null then 'Completed without a completed return inspection — override: ' || p_override_reason
      else 'Return inspection completed and rental closed'
    end,
    jsonb_build_object('reservation_id', p_reservation_id, 'vehicle_id', v_reservation.vehicle_id)
  );

  return v_reservation;
end;
$$;

-- ---------------------------------------------------------------------
-- complete_inspection / correct_inspection
-- ---------------------------------------------------------------------
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

  perform public.log_activity(
    v_inspection.company_id,
    auth.uid(),
    'inspection_completed',
    'inspection',
    p_inspection_id,
    initcap(v_inspection.type) || ' inspection completed',
    null,
    jsonb_build_object('reservation_id', v_inspection.reservation_id, 'inspection_id', p_inspection_id)
  );

  return v_inspection;
end;
$$;

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

  perform public.log_activity(
    v_inspection.company_id,
    auth.uid(),
    'inspection_corrected',
    'inspection',
    p_inspection_id,
    initcap(v_inspection.type) || ' inspection corrected',
    p_reason,
    jsonb_build_object('reservation_id', v_inspection.reservation_id, 'inspection_id', p_inspection_id)
  );

  return v_inspection;
end;
$$;

-- ---------------------------------------------------------------------
-- create_maintenance / start_maintenance / complete_maintenance /
-- cancel_maintenance
-- ---------------------------------------------------------------------
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

  perform public.log_activity(
    v_company_id,
    auth.uid(),
    case when p_status in ('in_progress', 'waiting_for_parts') then 'vehicle_entered_maintenance' else 'maintenance_scheduled' end,
    'maintenance',
    v_record.id,
    initcap(replace(p_type, '_', ' ')) || ' recorded',
    p_description,
    jsonb_build_object('vehicle_id', p_vehicle_id, 'maintenance_id', v_record.id)
  );

  return v_record;
end;
$$;

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

  perform public.log_activity(
    v_record.company_id,
    auth.uid(),
    'vehicle_entered_maintenance',
    'maintenance',
    v_record.id,
    initcap(replace(v_record.type, '_', ' ')) || ' started',
    null,
    jsonb_build_object('vehicle_id', v_record.vehicle_id, 'maintenance_id', v_record.id)
  );

  return v_record;
end;
$$;

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

  perform public.log_activity(
    v_record.company_id,
    auth.uid(),
    'maintenance_completed',
    'maintenance',
    v_record.id,
    initcap(replace(v_record.type, '_', ' ')) || ' completed',
    null,
    jsonb_build_object('vehicle_id', v_record.vehicle_id, 'maintenance_id', v_record.id)
  );

  return v_record;
end;
$$;

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

  perform public.log_activity(
    v_record.company_id,
    auth.uid(),
    'maintenance_cancelled',
    'maintenance',
    v_record.id,
    initcap(replace(v_record.type, '_', ' ')) || ' cancelled',
    null,
    jsonb_build_object('vehicle_id', v_record.vehicle_id, 'maintenance_id', v_record.id)
  );

  return v_record;
end;
$$;

-- ---------------------------------------------------------------------
-- invite_member / accept_invitation / suspend_member / reactivate_member
-- / remove_member
-- ---------------------------------------------------------------------
create or replace function public.invite_member(
  p_company_id uuid,
  p_email text,
  p_role text,
  p_branch_id uuid default null
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_invitation public.invitations;
begin
  v_role := public.company_role(p_company_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Not permitted to invite members';
  end if;

  if p_role not in ('owner', 'manager', 'agent', 'accountant', 'driver') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if p_role = 'owner' and v_role <> 'owner' then
    raise exception 'Only an owner can invite another owner';
  end if;

  if exists (
    select 1 from public.company_memberships
    where company_id = p_company_id and status = 'active'
      and user_id in (select id from auth.users where lower(email) = lower(p_email))
  ) then
    raise exception 'This person already has access to this company';
  end if;

  insert into public.invitations (company_id, email, role, branch_id, invited_by)
  values (p_company_id, lower(btrim(p_email)), p_role, p_branch_id, auth.uid())
  on conflict (company_id, lower(email)) where status = 'pending'
  do update set
    role = excluded.role,
    branch_id = excluded.branch_id,
    token = gen_random_uuid(),
    invited_by = excluded.invited_by,
    expires_at = now() + interval '7 days',
    created_at = now()
  returning * into v_invitation;

  perform public.log_activity(
    p_company_id, auth.uid(), 'member_invited', 'invitation', v_invitation.id,
    'Team member invited', p_email, jsonb_build_object('invitation_id', v_invitation.id)
  );

  return v_invitation;
end;
$$;

create or replace function public.accept_invitation(p_token uuid)
returns public.company_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.invitations;
  v_user_email text;
  v_membership public.company_memberships;
begin
  select * into v_invitation from public.invitations where token = p_token;
  if v_invitation is null then
    raise exception 'This invitation link is invalid';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'This invitation has already been used or is no longer valid';
  end if;

  if v_invitation.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_invitation.id;
    raise exception 'This invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into public.company_memberships (company_id, user_id, role, branch_id, status)
  values (v_invitation.company_id, auth.uid(), v_invitation.role, v_invitation.branch_id, 'active')
  on conflict (company_id, user_id) do update set
    role = excluded.role,
    branch_id = excluded.branch_id,
    status = 'active'
  returning * into v_membership;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_invitation.id;

  perform public.log_activity(
    v_invitation.company_id, auth.uid(), 'invitation_accepted', 'invitation', v_invitation.id,
    'Invitation accepted', null, jsonb_build_object('invitation_id', v_invitation.id)
  );

  return v_membership;
end;
$$;

create or replace function public.suspend_member(p_membership_id uuid)
returns public.company_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.company_memberships;
  v_actor_role text;
  v_owner_count integer;
begin
  select * into v_target from public.company_memberships where id = p_membership_id;
  if v_target is null then
    raise exception 'Member not found';
  end if;

  v_actor_role := public.company_role(v_target.company_id);
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'Not permitted to suspend members';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'You cannot suspend your own access';
  end if;

  if v_target.role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can suspend another owner';
  end if;

  if v_target.role = 'owner' then
    select count(*) into v_owner_count
    from public.company_memberships
    where company_id = v_target.company_id and role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      raise exception 'A company must always have at least one active owner';
    end if;
  end if;

  update public.company_memberships set status = 'suspended' where id = p_membership_id
  returning * into v_target;

  perform public.log_activity(
    v_target.company_id, auth.uid(), 'user_suspended', 'membership', v_target.id,
    'Team member suspended', null, jsonb_build_object('membership_id', v_target.id)
  );

  return v_target;
end;
$$;

create or replace function public.reactivate_member(p_membership_id uuid)
returns public.company_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.company_memberships;
begin
  select * into v_target from public.company_memberships where id = p_membership_id;
  if v_target is null then
    raise exception 'Member not found';
  end if;

  if public.company_role(v_target.company_id) not in ('owner', 'manager') then
    raise exception 'Not permitted to reactivate members';
  end if;

  update public.company_memberships set status = 'active' where id = p_membership_id
  returning * into v_target;

  perform public.log_activity(
    v_target.company_id, auth.uid(), 'user_reactivated', 'membership', v_target.id,
    'Team member reactivated', null, jsonb_build_object('membership_id', v_target.id)
  );

  return v_target;
end;
$$;

create or replace function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.company_memberships;
  v_actor_role text;
  v_owner_count integer;
begin
  select * into v_target from public.company_memberships where id = p_membership_id;
  if v_target is null then
    raise exception 'Member not found';
  end if;

  v_actor_role := public.company_role(v_target.company_id);
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'Not permitted to remove members';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'You cannot remove your own access';
  end if;

  if v_target.role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can remove another owner';
  end if;

  if v_target.role = 'owner' then
    select count(*) into v_owner_count
    from public.company_memberships
    where company_id = v_target.company_id and role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      raise exception 'A company must always have at least one owner';
    end if;
  end if;

  delete from public.company_memberships where id = p_membership_id;

  perform public.log_activity(
    v_target.company_id, auth.uid(), 'user_removed', 'membership', p_membership_id,
    'Team member removed', null, jsonb_build_object('membership_id', p_membership_id)
  );
end;
$$;
