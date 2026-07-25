-- Roadmap phase 17 ("Role-Specific Field Views & Granular Permission
-- Engine") — schema foundation. Written but, per this project's standing
-- rule, NOT applied to the live Supabase project from this session.
--
-- Two new operational roles (cleaner, mechanic) plus the tables backing a
-- granular, overridable permission engine that will replace the hardcoded
-- company_role(company_id) in (...) lists used throughout RLS (see
-- 20260804090100_phase17_permission_engine.sql for has_permission() and
-- the policy rewrite itself).

-- ---------------------------------------------------------------------
-- 1. New roles: cleaner, mechanic.
-- ---------------------------------------------------------------------
alter table public.company_memberships drop constraint company_memberships_role_check;
alter table public.company_memberships add constraint company_memberships_role_check
  check (role in ('owner', 'manager', 'agent', 'accountant', 'driver', 'cleaner', 'mechanic'));

alter table public.invitations drop constraint invitations_role_check;
alter table public.invitations add constraint invitations_role_check
  check (role in ('owner', 'manager', 'agent', 'accountant', 'driver', 'cleaner', 'mechanic'));

-- invite_member/update_member_role validate p_role inline against the
-- same fixed list (see 20260720090500_invitations.sql) — widen both to
-- match the constraint above. Signatures are unchanged, so this replaces
-- the function bodies in place.
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

  if p_role not in ('owner', 'manager', 'agent', 'accountant', 'driver', 'cleaner', 'mechanic') then
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

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    p_company_id, auth.uid(), 'member_invited', 'Team member invited',
    p_email, jsonb_build_object('invitation_id', v_invitation.id)
  );

  return v_invitation;
end;
$$;

revoke all on function public.invite_member(uuid, text, text, uuid) from public;
grant execute on function public.invite_member(uuid, text, text, uuid) to authenticated;

create or replace function public.update_member_role(p_membership_id uuid, p_role text)
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
    raise exception 'Not permitted to change roles';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  if p_role not in ('owner', 'manager', 'agent', 'accountant', 'driver', 'cleaner', 'mechanic') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if (p_role = 'owner' or v_target.role = 'owner') and v_actor_role <> 'owner' then
    raise exception 'Only an owner can grant or change ownership';
  end if;

  if v_target.role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count
    from public.company_memberships
    where company_id = v_target.company_id and role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      raise exception 'A company must always have at least one owner';
    end if;
  end if;

  update public.company_memberships set role = p_role where id = p_membership_id
  returning * into v_target;

  return v_target;
end;
$$;

revoke all on function public.update_member_role(uuid, text) from public;
grant execute on function public.update_member_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. role_permission_defaults — the per-role fallback the new
-- has_permission() reads when no per-employee override exists. Seeded to
-- reproduce today's actual RLS behaviour for owner/manager/agent/
-- accountant exactly (see row-list comments below, each cross-referenced
-- against the policy it mirrors), and to deliberately NOT reproduce
-- driver's current unrestricted reads — driver has always had the same
-- unscoped SELECT access as every other role because no SELECT policy in
-- this codebase has ever checked role; that was always the gap this
-- phase exists to close, not a behaviour worth preserving. Cleaner and
-- mechanic get minimal, operational-scope-only defaults.
-- ---------------------------------------------------------------------
create table public.role_permission_defaults (
  role text not null check (role in ('owner', 'manager', 'agent', 'accountant', 'driver', 'cleaner', 'mechanic')),
  permission_key text not null,
  allowed boolean not null default false,
  primary key (role, permission_key)
);

-- view_customers / view_reservations / view_financial_reports: today
-- every one of these is `is_company_member(company_id)` with no role
-- check at all (see row_level_security.sql SELECT policies on customers/
-- reservations/payments/expenses) — true for owner/manager/agent/
-- accountant preserves that; false for driver/cleaner/mechanic is this
-- phase's actual fix.
insert into public.role_permission_defaults (role, permission_key, allowed)
select r.role, k.key, r.role in ('owner', 'manager', 'agent', 'accountant')
from (values ('owner'), ('manager'), ('agent'), ('accountant'), ('driver'), ('cleaner'), ('mechanic')) as r(role)
cross join (values ('view_customers'), ('view_reservations'), ('view_financial_reports')) as k(key);

-- edit_customers / edit_reservations: mirrors the current
-- `company_role(company_id) in ('owner', 'manager', 'agent')` INSERT/
-- UPDATE policies on customers and reservations exactly.
insert into public.role_permission_defaults (role, permission_key, allowed)
select r.role, k.key, r.role in ('owner', 'manager', 'agent')
from (values ('owner'), ('manager'), ('agent'), ('accountant'), ('driver'), ('cleaner'), ('mechanic')) as r(role)
cross join (values ('edit_customers'), ('edit_reservations')) as k(key);

-- record_payments: mirrors the current
-- `company_role(company_id) in ('owner', 'manager', 'accountant')`
-- INSERT/UPDATE policies on payments and expenses exactly.
insert into public.role_permission_defaults (role, permission_key, allowed)
select r.role, 'record_payments', r.role in ('owner', 'manager', 'accountant')
from (values ('owner'), ('manager'), ('agent'), ('accountant'), ('driver'), ('cleaner'), ('mechanic')) as r(role);

-- manage_vehicles: mirrors is_company_manager_or_owner() on the vehicles
-- write policies exactly.
insert into public.role_permission_defaults (role, permission_key, allowed)
select r.role, 'manage_vehicles', r.role in ('owner', 'manager')
from (values ('owner'), ('manager'), ('agent'), ('accountant'), ('driver'), ('cleaner'), ('mechanic')) as r(role);

-- manage_maintenance: owner/manager as today, plus mechanic (scoped to
-- assigned-or-unassigned rows at the RLS layer, not here).
insert into public.role_permission_defaults (role, permission_key, allowed)
select r.role, 'manage_maintenance', r.role in ('owner', 'manager', 'mechanic')
from (values ('owner'), ('manager'), ('agent'), ('accountant'), ('driver'), ('cleaner'), ('mechanic')) as r(role);

-- manage_cleaning_tasks: owner/manager plus cleaner (same assigned-or-
-- unassigned scoping as manage_maintenance).
insert into public.role_permission_defaults (role, permission_key, allowed)
select r.role, 'manage_cleaning_tasks', r.role in ('owner', 'manager', 'cleaner')
from (values ('owner'), ('manager'), ('agent'), ('accountant'), ('driver'), ('cleaner'), ('mechanic')) as r(role);

-- view_assigned_deliveries: driver only — this is what gives driver its
-- row-scoped read (their assigned reservations), replacing the
-- unrestricted access they had before this phase.
insert into public.role_permission_defaults (role, permission_key, allowed)
select r.role, 'view_assigned_deliveries', r.role = 'driver'
from (values ('owner'), ('manager'), ('agent'), ('accountant'), ('driver'), ('cleaner'), ('mechanic')) as r(role);

-- approve_refunds / generate_contracts / approve_contracts /
-- download_documents / manage_employees / configure_integrations: none
-- of these have an existing RLS precedent to preserve — no table's
-- policy has ever referenced them. Seeded conservatively (owner/manager
-- only); anyone else who needs one is a one-off override, not a new
-- default.
insert into public.role_permission_defaults (role, permission_key, allowed)
select r.role, k.key, r.role in ('owner', 'manager')
from (values ('owner'), ('manager'), ('agent'), ('accountant'), ('driver'), ('cleaner'), ('mechanic')) as r(role)
cross join (values
  ('approve_refunds'), ('generate_contracts'), ('approve_contracts'),
  ('download_documents'), ('manage_employees'), ('configure_integrations')
) as k(key);

-- ---------------------------------------------------------------------
-- 3. employee_permission_overrides — per-employee grant/revoke, written
-- only via grant_permission_override()/revoke_permission_override() (see
-- 20260804090100_phase17_permission_engine.sql). A non-null expires_at in
-- the future is a time-boxed elevation; null is permanent. No cron:
-- has_permission() checks expiry lazily on every read.
-- ---------------------------------------------------------------------
create table public.employee_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  permission_key text not null,
  allowed boolean not null,
  granted_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index employee_permission_overrides_lookup_idx
  on public.employee_permission_overrides (company_id, user_id, permission_key);

alter table public.employee_permission_overrides enable row level security;

-- Reads only, and only within your own company — writes exclusively
-- through the SECURITY DEFINER RPCs, same convention as company_memberships.
create policy "Members can view permission overrides in their company"
  on public.employee_permission_overrides for select
  using (public.is_company_member(company_id));

-- ---------------------------------------------------------------------
-- 4. maintenance_records.assigned_employee_id — mirrors
-- reservations.assigned_employee_id (20260803090000_mobile_field_foundation.sql)
-- exactly: nullable, on delete set null, an unassigned record stays
-- visible to every owner/manager/mechanic/cleaner exactly as before.
-- Note: maintenance_records.type already allows 'cleaning' (added by
-- 20260720090000_maintenance_upgrade.sql) — no change needed there.
-- ---------------------------------------------------------------------
alter table public.maintenance_records
  add column assigned_employee_id uuid references auth.users (id) on delete set null;

create index maintenance_records_assigned_employee_idx
  on public.maintenance_records (company_id, assigned_employee_id)
  where assigned_employee_id is not null;

-- ---------------------------------------------------------------------
-- 5. Blacklist: customers.status already has a 'blocked' value and
-- setCustomerStatus() already sets it (owner/manager only, see
-- app/(dashboard)/customers/actions.ts) — no new columns needed. This
-- phase only adds a required reason to that existing transition (see
-- component work in a later checkpoint); the reason is recorded in
-- activity_log.metadata via recordEvent(), the same place
-- setCustomerStatus() already logs before/after status, rather than a
-- new dedicated column.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 6. approval_requests — one type-discriminated table for every
-- "employee proposes, owner/manager reviews" workflow this phase needs
-- (large discounts, refunds, contract amendments, vehicle exchanges,
-- blacklist requests). resolve_approval_request() performs the approved
-- side effect itself (see 20260804090200_phase17_approval_workflow.sql)
-- rather than replaying the payload through the requester's own action —
-- unlike the AI proposal flow in lib/ai/tools.ts, the requester here
-- lacks the underlying permission by definition, so there is no action
-- of theirs to safely replay.
-- ---------------------------------------------------------------------
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null check (type in (
    'large_discount', 'refund', 'contract_amendment', 'vehicle_exchange', 'blacklist_customer'
  )),
  entity_type text,
  entity_id uuid,
  requested_by uuid not null references auth.users (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text not null check (char_length(btrim(reason)) > 0),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index approval_requests_company_status_idx on public.approval_requests (company_id, status);

alter table public.approval_requests enable row level security;

create policy "Members can view approval requests in their company"
  on public.approval_requests for select
  using (public.is_company_member(company_id));

-- ---------------------------------------------------------------------
-- 7. notifications: three new types for the approval workflow.
-- ---------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'pickup_approaching',
  'return_approaching',
  'rental_overdue',
  'outstanding_balance',
  'deposit_unresolved',
  'maintenance_due',
  'maintenance_overdue',
  'vehicle_document_expiring',
  'licence_expiring',
  'damage_recorded',
  'inspection_draft_unfinished',
  'vehicle_unavailable_upcoming_reservation',
  'approval_requested',
  'approval_approved',
  'approval_rejected'
));
