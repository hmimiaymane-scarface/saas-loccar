-- Row Level Security for every company-owned table.
--
-- This file is the security boundary for the whole product: a user can
-- read or write a row only if they are a member of the company that owns
-- it, and the specific action is allowed for their role. Frontend
-- navigation may also hide sections by role (see lib/navigation.ts), but
-- that is a usability layer only — this file is what actually stops
-- cross-company access, even if a request bypasses the UI entirely.
--
-- Role tiers used below:
--   owner, manager        -> full read/write, including delete, on all
--                            operational tables.
--   agent                 -> read everything in the company; write
--                            customers and reservations (the day-to-day
--                            front-desk job). No vehicle, payment, expense
--                            or maintenance writes.
--   accountant             -> read everything; write payments and expenses.
--   driver                -> read-only for now. Scoped operational actions
--                            (pickup/return/inspection) are a future phase.
--
-- WITH CHECK on every INSERT/UPDATE policy re-validates company_id against
-- is_company_member()/is_company_manager_or_owner(), which is what stops a
-- member of company A from writing a row that claims to belong to
-- company B: the check re-evaluates against the *new* row's company_id,
-- and the caller is never a member of B.

-- ---------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------
alter table public.companies enable row level security;

create policy "Members can view their companies"
  on public.companies for select
  using (public.is_company_member(id));

-- No INSERT policy: companies are only created through the
-- create_company_with_owner() SECURITY DEFINER function (see
-- 20260718120900_onboarding_function.sql), which assigns the caller as
-- owner atomically. A direct client insert here is always denied.

create policy "Owners and managers can update their company"
  on public.companies for update
  using (public.is_company_manager_or_owner(id))
  with check (public.is_company_manager_or_owner(id));

-- No DELETE policy: company deletion is not exposed in this phase.

-- ---------------------------------------------------------------------
-- company_memberships
-- ---------------------------------------------------------------------
alter table public.company_memberships enable row level security;

create policy "Members can view memberships in their companies"
  on public.company_memberships for select
  using (
    user_id = auth.uid()
    or public.is_company_manager_or_owner(company_id)
  );

-- No INSERT/UPDATE/DELETE policy for ordinary authenticated users: a user
-- can never grant themselves a role, change their own role, or remove
-- someone else's membership through the API. Membership rows are only
-- ever written by SECURITY DEFINER functions (onboarding today; a future
-- invitation/role-management RPC will follow the same pattern).

-- ---------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------
alter table public.branches enable row level security;

create policy "Members can view branches"
  on public.branches for select
  using (public.is_company_member(company_id));

create policy "Managers can create branches"
  on public.branches for insert
  with check (public.is_company_manager_or_owner(company_id));

create policy "Managers can update branches"
  on public.branches for update
  using (public.is_company_manager_or_owner(company_id))
  with check (public.is_company_manager_or_owner(company_id));

create policy "Owners can delete branches"
  on public.branches for delete
  using (public.is_company_owner(company_id));

-- ---------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------
alter table public.vehicles enable row level security;

create policy "Members can view vehicles"
  on public.vehicles for select
  using (public.is_company_member(company_id));

create policy "Managers can create vehicles"
  on public.vehicles for insert
  with check (public.is_company_manager_or_owner(company_id));

create policy "Managers can update vehicles"
  on public.vehicles for update
  using (public.is_company_manager_or_owner(company_id))
  with check (public.is_company_manager_or_owner(company_id));

create policy "Managers can delete vehicles"
  on public.vehicles for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
alter table public.customers enable row level security;

create policy "Members can view customers"
  on public.customers for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can create customers"
  on public.customers for insert
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

create policy "Front-desk roles can update customers"
  on public.customers for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

create policy "Managers can delete customers"
  on public.customers for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- reservations
-- ---------------------------------------------------------------------
alter table public.reservations enable row level security;

create policy "Members can view reservations"
  on public.reservations for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can create reservations"
  on public.reservations for insert
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

create policy "Front-desk roles can update reservations"
  on public.reservations for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

create policy "Managers can delete reservations"
  on public.reservations for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
alter table public.payments enable row level security;

create policy "Members can view payments"
  on public.payments for select
  using (public.is_company_member(company_id));

create policy "Finance roles can record payments"
  on public.payments for insert
  with check (public.company_role(company_id) in ('owner', 'manager', 'accountant'));

create policy "Finance roles can update payments"
  on public.payments for update
  using (public.company_role(company_id) in ('owner', 'manager', 'accountant'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'accountant'));

create policy "Managers can delete payments"
  on public.payments for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------
alter table public.expenses enable row level security;

create policy "Members can view expenses"
  on public.expenses for select
  using (public.is_company_member(company_id));

create policy "Finance roles can record expenses"
  on public.expenses for insert
  with check (public.company_role(company_id) in ('owner', 'manager', 'accountant'));

create policy "Finance roles can update expenses"
  on public.expenses for update
  using (public.company_role(company_id) in ('owner', 'manager', 'accountant'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'accountant'));

create policy "Managers can delete expenses"
  on public.expenses for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- maintenance_records
-- ---------------------------------------------------------------------
alter table public.maintenance_records enable row level security;

create policy "Members can view maintenance records"
  on public.maintenance_records for select
  using (public.is_company_member(company_id));

create policy "Managers can create maintenance records"
  on public.maintenance_records for insert
  with check (public.is_company_manager_or_owner(company_id));

create policy "Managers can update maintenance records"
  on public.maintenance_records for update
  using (public.is_company_manager_or_owner(company_id))
  with check (public.is_company_manager_or_owner(company_id));

create policy "Managers can delete maintenance records"
  on public.maintenance_records for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- activity_log — append-only for everyone, including owners.
-- ---------------------------------------------------------------------
alter table public.activity_log enable row level security;

create policy "Members can view activity"
  on public.activity_log for select
  using (public.is_company_member(company_id));

create policy "Members can record activity"
  on public.activity_log for insert
  with check (public.is_company_member(company_id));

-- No UPDATE/DELETE policy for anyone: the log is immutable by design.
