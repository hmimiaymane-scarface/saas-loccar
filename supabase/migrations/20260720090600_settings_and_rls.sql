-- Company-level settings for this phase. Deliberately a handful of plain
-- columns on `companies` rather than a separate settings table or a
-- customizable-category system — "do not create a giant settings area"
-- is explicit in the brief, and every one of these already has a
-- sensible default so most companies never have to touch this page.
alter table public.companies
  add column maintenance_reminder_days integer not null default 14 check (maintenance_reminder_days > 0),
  add column document_expiry_warning_days integer not null default 30 check (document_expiry_warning_days > 0),
  add column agents_can_record_expenses boolean not null default false,
  add column muted_notification_types text[] not null default '{}';

-- ---------------------------------------------------------------------
-- notifications RLS — every row is per-user, so "own rows only" is both
-- the simplest and the correct policy (see the table's own comment for
-- why there's no company-wide row to worry about).
-- ---------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  using (user_id = auth.uid() and public.is_company_member(company_id));

create policy "Users can create their own notifications"
  on public.notifications for insert
  with check (user_id = auth.uid() and public.is_company_member(company_id));

create policy "Users can update their own notifications"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- expenses — strengthen INSERT so a client-supplied vehicle_id or
-- maintenance_record_id can't reference another company's row (the same
-- ownership-consistency pattern used throughout the handoff phase's RLS).
-- Also widen who may record an expense to include agents — whether an
-- agent's insert actually succeeds is then decided by
-- companies.agents_can_record_expenses, checked in the server action
-- (see docs/security.md's "coarse RLS + fine action-layer check"
-- pattern), not by a second RLS policy.
-- ---------------------------------------------------------------------
drop policy "Finance roles can record expenses" on public.expenses;
create policy "Finance-adjacent roles can record expenses"
  on public.expenses for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'accountant', 'agent')
    and (vehicle_id is null or exists (
      select 1 from public.vehicles where id = vehicle_id and company_id = expenses.company_id
    ))
    and (maintenance_record_id is null or exists (
      select 1 from public.maintenance_records where id = maintenance_record_id and company_id = expenses.company_id
    ))
    and (reservation_id is null or exists (
      select 1 from public.reservations where id = reservation_id and company_id = expenses.company_id
    ))
  );

-- ---------------------------------------------------------------------
-- maintenance_records — same ownership-consistency strengthening on the
-- direct-insert path (plain scheduling with no vehicle-status change,
-- e.g. via updateMaintenance()'s create fallback); create_maintenance()
-- already resolves company_id from the vehicle itself so it can't drift.
-- ---------------------------------------------------------------------
drop policy "Managers can create maintenance records" on public.maintenance_records;
create policy "Managers can create maintenance records"
  on public.maintenance_records for insert
  with check (
    public.is_company_manager_or_owner(company_id)
    and exists (select 1 from public.vehicles where id = vehicle_id and company_id = maintenance_records.company_id)
  );
