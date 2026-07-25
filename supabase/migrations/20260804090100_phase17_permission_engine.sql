-- Roadmap phase 17 — the has_permission() resolution primitive, the
-- SECURITY DEFINER RPCs that are the only way employee_permission_overrides
-- rows get written, and the RLS rewrite that replaces hardcoded
-- company_role(company_id) in (...) lists with has_permission() calls on
-- customers/reservations/payments/expenses/maintenance_records. Written
-- but, per this project's standing rule, NOT applied to the live
-- Supabase project from this session.

-- ---------------------------------------------------------------------
-- has_permission(): same SECURITY DEFINER / stable / search_path-pinned
-- style as is_company_member/company_role (see
-- 20260720090500_invitations.sql) — checks a non-expired per-employee
-- override first, falls back to the caller's role default, else false.
-- ---------------------------------------------------------------------
create or replace function public.has_permission(target_company_id uuid, key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select allowed
      from public.employee_permission_overrides
      where company_id = target_company_id
        and user_id = auth.uid()
        and permission_key = key
        and (expires_at is null or expires_at > now())
      order by created_at desc
      limit 1
    ),
    (
      select allowed
      from public.role_permission_defaults
      where role = public.company_role(target_company_id)
        and permission_key = key
    ),
    false
  );
$$;

revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- grant_permission_override / revoke_permission_override: owner/manager
-- only, mirroring update_member_role's guard shape exactly (actor role
-- check, revoke-from-public + grant-to-authenticated). p_permission_key
-- is validated against the same fixed catalog lib/permissions/catalog.ts
-- exports (mirrored here as a literal list, same convention as
-- invite_member's inline p_role validation).
-- ---------------------------------------------------------------------
create or replace function public.grant_permission_override(
  p_company_id uuid,
  p_user_id uuid,
  p_permission_key text,
  p_allowed boolean,
  p_reason text,
  p_expires_at timestamptz default null
)
returns public.employee_permission_overrides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_override public.employee_permission_overrides;
begin
  v_actor_role := public.company_role(p_company_id);
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'Not permitted to grant permission overrides';
  end if;

  if not exists (
    select 1 from public.company_memberships
    where company_id = p_company_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'That person is not an active member of this company';
  end if;

  if p_permission_key not in (
    'view_customers', 'edit_customers', 'view_reservations', 'edit_reservations',
    'view_financial_reports', 'record_payments', 'approve_refunds',
    'generate_contracts', 'approve_contracts', 'download_documents',
    'manage_vehicles', 'manage_maintenance', 'manage_cleaning_tasks',
    'view_assigned_deliveries', 'manage_employees', 'configure_integrations'
  ) then
    raise exception 'Unknown permission key: %', p_permission_key;
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required to grant or revoke a permission override';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  insert into public.employee_permission_overrides
    (company_id, user_id, permission_key, allowed, granted_by, reason, expires_at)
  values (p_company_id, p_user_id, p_permission_key, p_allowed, auth.uid(), p_reason, p_expires_at)
  returning * into v_override;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    p_company_id, auth.uid(), 'permission_override_granted', 'Permission override granted',
    p_reason,
    jsonb_build_object(
      'override_id', v_override.id, 'user_id', p_user_id, 'permission_key', p_permission_key,
      'allowed', p_allowed, 'expires_at', p_expires_at
    )
  );

  return v_override;
end;
$$;

revoke all on function public.grant_permission_override(uuid, uuid, text, boolean, text, timestamptz) from public;
grant execute on function public.grant_permission_override(uuid, uuid, text, boolean, text, timestamptz) to authenticated;

create or replace function public.revoke_permission_override(p_override_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.employee_permission_overrides;
  v_actor_role text;
begin
  select * into v_target from public.employee_permission_overrides where id = p_override_id;
  if v_target is null then
    raise exception 'Override not found';
  end if;

  v_actor_role := public.company_role(v_target.company_id);
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'Not permitted to revoke permission overrides';
  end if;

  delete from public.employee_permission_overrides where id = p_override_id;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_target.company_id, auth.uid(), 'permission_override_revoked', 'Permission override revoked',
    null,
    jsonb_build_object('override_id', p_override_id, 'user_id', v_target.user_id, 'permission_key', v_target.permission_key)
  );
end;
$$;

revoke all on function public.revoke_permission_override(uuid) from public;
grant execute on function public.revoke_permission_override(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS rewrite: customers, reservations (SELECT + INSERT/UPDATE),
-- payments, expenses (SELECT + INSERT/UPDATE), maintenance_records
-- (SELECT + INSERT/UPDATE). DELETE policies on every one of these
-- tables are left untouched (still is_company_manager_or_owner(company_id)
-- directly) — deletion is a stable owner/manager invariant this phase
-- does not make overridable per-employee.
-- ---------------------------------------------------------------------

-- customers: view_customers covers the general case; a driver/cleaner/
-- mechanic with no view_customers grant can still see a customer they
-- have an assigned reservation for (needed for delivery/cleaning/repair
-- context — name, phone, license — without opening up the whole table).
drop policy "Members can view customers" on public.customers;
create policy "Permitted roles can view customers"
  on public.customers for select
  using (
    public.has_permission(company_id, 'view_customers')
    or (
      public.has_permission(company_id, 'view_assigned_deliveries')
      and exists (
        select 1 from public.reservations r
        where r.customer_id = customers.id and r.assigned_employee_id = auth.uid()
      )
    )
  );

drop policy "Front-desk roles can create customers" on public.customers;
create policy "Permitted roles can create customers"
  on public.customers for insert
  with check (public.has_permission(company_id, 'edit_customers'));

drop policy "Front-desk roles can update customers" on public.customers;
create policy "Permitted roles can update customers"
  on public.customers for update
  using (public.has_permission(company_id, 'edit_customers'))
  with check (public.has_permission(company_id, 'edit_customers'));

-- reservations: view_reservations covers the general case; a driver
-- (or any role holding view_assigned_deliveries) can always see their
-- own assigned reservation regardless of the general grant.
drop policy "Members can view reservations" on public.reservations;
create policy "Permitted roles can view reservations"
  on public.reservations for select
  using (
    public.has_permission(company_id, 'view_reservations')
    or (
      public.has_permission(company_id, 'view_assigned_deliveries')
      and assigned_employee_id = auth.uid()
    )
  );

drop policy "Front-desk roles can create reservations" on public.reservations;
create policy "Permitted roles can create reservations"
  on public.reservations for insert
  with check (public.has_permission(company_id, 'edit_reservations'));

drop policy "Front-desk roles can update reservations" on public.reservations;
create policy "Permitted roles can update reservations"
  on public.reservations for update
  using (public.has_permission(company_id, 'edit_reservations'))
  with check (public.has_permission(company_id, 'edit_reservations'));

-- payments
drop policy "Members can view payments" on public.payments;
create policy "Permitted roles can view payments"
  on public.payments for select
  using (public.has_permission(company_id, 'view_financial_reports'));

drop policy "Finance roles can record payments" on public.payments;
create policy "Permitted roles can record payments"
  on public.payments for insert
  with check (public.has_permission(company_id, 'record_payments'));

drop policy "Finance roles can update payments" on public.payments;
create policy "Permitted roles can update payments"
  on public.payments for update
  using (public.has_permission(company_id, 'record_payments'))
  with check (public.has_permission(company_id, 'record_payments'));

-- expenses (same permission keys as payments — the two have always
-- shared the same role gate, see the pre-phase-17 policies).
drop policy "Members can view expenses" on public.expenses;
create policy "Permitted roles can view expenses"
  on public.expenses for select
  using (public.has_permission(company_id, 'view_financial_reports'));

drop policy "Finance roles can record expenses" on public.expenses;
create policy "Permitted roles can record expenses"
  on public.expenses for insert
  with check (public.has_permission(company_id, 'record_payments'));

drop policy "Finance roles can update expenses" on public.expenses;
create policy "Permitted roles can update expenses"
  on public.expenses for update
  using (public.has_permission(company_id, 'record_payments'))
  with check (public.has_permission(company_id, 'record_payments'));

-- maintenance_records: owner/manager keep full, unscoped visibility
-- (is_company_manager_or_owner, exactly as before this phase — they
-- manage the whole operation, not just their own jobs). Mechanic/
-- cleaner (or anyone else holding manage_maintenance/
-- manage_cleaning_tasks only via an override, not the owner/manager
-- role itself) are scoped to assigned-to-me-or-unassigned, mirroring
-- the exact filter lib/mobile/mission-feed-data.ts already applies to
-- reservations.
drop policy "Members can view maintenance records" on public.maintenance_records;
create policy "Permitted roles can view maintenance records"
  on public.maintenance_records for select
  using (
    public.is_company_manager_or_owner(company_id)
    or (
      (
        public.has_permission(company_id, 'manage_maintenance')
        or public.has_permission(company_id, 'manage_cleaning_tasks')
      )
      and (assigned_employee_id is null or assigned_employee_id = auth.uid())
    )
  );

drop policy "Managers can create maintenance records" on public.maintenance_records;
create policy "Permitted roles can create maintenance records"
  on public.maintenance_records for insert
  with check (
    public.is_company_manager_or_owner(company_id)
    or public.has_permission(company_id, 'manage_maintenance')
    or public.has_permission(company_id, 'manage_cleaning_tasks')
  );

drop policy "Managers can update maintenance records" on public.maintenance_records;
create policy "Permitted roles can update maintenance records"
  on public.maintenance_records for update
  using (
    public.is_company_manager_or_owner(company_id)
    or (
      (
        public.has_permission(company_id, 'manage_maintenance')
        or public.has_permission(company_id, 'manage_cleaning_tasks')
      )
      and (assigned_employee_id is null or assigned_employee_id = auth.uid())
    )
  )
  with check (
    public.is_company_manager_or_owner(company_id)
    or public.has_permission(company_id, 'manage_maintenance')
    or public.has_permission(company_id, 'manage_cleaning_tasks')
  );
