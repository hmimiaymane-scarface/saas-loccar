-- RLS for every table added in this phase. Same helper-function pattern
-- as supabase/migrations/20260718120700_security_helper_functions.sql —
-- see docs/security.md for why SECURITY DEFINER + set search_path avoids
-- recursion.
--
-- Deliberate simplification, documented once here: several roles get a
-- coarser INSERT/UPDATE grant at the RLS layer than the product spec's
-- finest-grained rule (e.g. "only owner/manager resolve a damage" or
-- "only owner/manager return a deposit"). RLS enforces company isolation
-- and the baseline "which roles touch this table at all" — the sharper
-- distinction ("agent can open a damage, only manager can close it") is
-- enforced in the corresponding server action, which is where per-field,
-- per-transition logic belongs. This mirrors how vehicle status changes
-- were already split between coarse table RLS and the narrower
-- transition_reservation_status() function in the previous phase.

-- ---------------------------------------------------------------------
-- checklist_template_items — configuration, not operational data: any
-- member can read it (they need it to render an inspection), only
-- owner/manager can change it.
-- ---------------------------------------------------------------------
alter table public.checklist_template_items enable row level security;

create policy "Members can view checklist templates"
  on public.checklist_template_items for select
  using (public.is_company_member(company_id));

create policy "Managers can manage checklist templates"
  on public.checklist_template_items for insert
  with check (public.is_company_manager_or_owner(company_id));

create policy "Managers can update checklist templates"
  on public.checklist_template_items for update
  using (public.is_company_manager_or_owner(company_id))
  with check (public.is_company_manager_or_owner(company_id));

create policy "Managers can delete checklist templates"
  on public.checklist_template_items for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
alter table public.documents enable row level security;

create policy "Members can view documents"
  on public.documents for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can upload documents"
  on public.documents for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and (reservation_id is null or exists (
      select 1 from public.reservations r where r.id = reservation_id and r.company_id = documents.company_id
    ))
    and (customer_id is null or exists (
      select 1 from public.customers c where c.id = customer_id and c.company_id = documents.company_id
    ))
    and (vehicle_id is null or exists (
      select 1 from public.vehicles v where v.id = vehicle_id and v.company_id = documents.company_id
    ))
  );

create policy "Front-desk roles can update documents"
  on public.documents for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

create policy "Managers can delete documents"
  on public.documents for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- inspections — UPDATE is only reachable while still a draft; once
-- completed, the USING clause's `status = 'draft'` no longer matches any
-- row, so ordinary UPDATEs are silently rejected. Corrections go through
-- correct_inspection() instead (SECURITY DEFINER, bypasses this).
-- ---------------------------------------------------------------------
alter table public.inspections enable row level security;

create policy "Members can view inspections"
  on public.inspections for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can start inspections"
  on public.inspections for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and r.company_id = inspections.company_id
        and r.vehicle_id = inspections.vehicle_id
        and r.customer_id = inspections.customer_id
    )
  );

create policy "Front-desk roles can update draft inspections"
  on public.inspections for update
  using (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and status = 'draft'
  )
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

-- ---------------------------------------------------------------------
-- inspection_checklist_responses — mutability follows the parent
-- inspection's draft status, not a status of its own.
-- ---------------------------------------------------------------------
alter table public.inspection_checklist_responses enable row level security;

create policy "Members can view checklist responses"
  on public.inspection_checklist_responses for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can record checklist responses"
  on public.inspection_checklist_responses for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id and i.status = 'draft'
    )
  );

create policy "Front-desk roles can update draft checklist responses"
  on public.inspection_checklist_responses for update
  using (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and exists (
      select 1 from public.inspections i
      where i.id = inspection_id and i.status = 'draft'
    )
  )
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

-- ---------------------------------------------------------------------
-- damages
-- ---------------------------------------------------------------------
alter table public.damages enable row level security;

create policy "Members can view damages"
  on public.damages for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can record damages"
  on public.damages for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id and v.company_id = damages.company_id
    )
  );

create policy "Front-desk roles can update damages"
  on public.damages for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

create policy "Managers can delete damages"
  on public.damages for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- media — polymorphic entity_id, so INSERT must independently verify the
-- referenced inspection/damage really belongs to the claimed company_id.
-- ---------------------------------------------------------------------
create or replace function public.media_entity_company_id(p_entity_type text, p_entity_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select case p_entity_type
    when 'inspection' then (select company_id from public.inspections where id = p_entity_id)
    when 'damage' then (select company_id from public.damages where id = p_entity_id)
    else null
  end;
$$;

revoke all on function public.media_entity_company_id(text, uuid) from public;
grant execute on function public.media_entity_company_id(text, uuid) to authenticated;

alter table public.media enable row level security;

create policy "Members can view media"
  on public.media for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can upload media"
  on public.media for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and company_id = public.media_entity_company_id(entity_type, entity_id)
  );

create policy "Managers can delete media"
  on public.media for delete
  using (public.is_company_manager_or_owner(company_id));

-- ---------------------------------------------------------------------
-- deposits
-- ---------------------------------------------------------------------
alter table public.deposits enable row level security;

create policy "Members can view deposits"
  on public.deposits for select
  using (public.is_company_member(company_id));

create policy "Front-desk roles can create deposit records"
  on public.deposits for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and exists (
      select 1 from public.reservations r where r.id = reservation_id and r.company_id = deposits.company_id
    )
  );

create policy "Front-desk roles can update deposits"
  on public.deposits for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

-- ---------------------------------------------------------------------
-- payments — widen the phase-2 policy to include agent. Recording
-- payments during pickup/return is now a normal front-desk action (see
-- role permissions in the phase brief), not accountant-only.
-- ---------------------------------------------------------------------
drop policy "Finance roles can record payments" on public.payments;
drop policy "Finance roles can update payments" on public.payments;

create policy "Finance roles can record payments"
  on public.payments for insert
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent', 'accountant'));

create policy "Finance roles can update payments"
  on public.payments for update
  using (public.company_role(company_id) in ('owner', 'manager', 'agent', 'accountant'))
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent', 'accountant'));
