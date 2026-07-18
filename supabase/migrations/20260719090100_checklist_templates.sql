-- Per-company, configurable inspection checklist. Seeded with a sensible
-- default set (see seed_default_checklist() below) rather than hardcoded
-- into application code, so a company can reorder, rename, add or retire
-- items later without a schema change.
create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  label text not null,
  category text not null check (category in ('condition', 'documents_and_items')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

create trigger checklist_template_items_set_updated_at
  before update on public.checklist_template_items
  for each row execute function public.set_updated_at();

create index checklist_template_items_company_id_idx on public.checklist_template_items (company_id);

-- Creates the default 13-item checklist for a company. SECURITY DEFINER so
-- it can be called from the owner-creation RPC and from a one-off
-- backfill; idempotent via ON CONFLICT so it's safe to call more than
-- once for the same company.
create or replace function public.seed_default_checklist(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.checklist_template_items (company_id, key, label, category, sort_order)
  values
    (target_company_id, 'exterior_condition', 'Exterior condition', 'condition', 1),
    (target_company_id, 'interior_condition', 'Interior condition', 'condition', 2),
    (target_company_id, 'tyres', 'Tyres', 'condition', 3),
    (target_company_id, 'spare_wheel', 'Spare wheel or repair kit', 'condition', 4),
    (target_company_id, 'lights', 'Lights', 'condition', 5),
    (target_company_id, 'mirrors', 'Mirrors', 'condition', 6),
    (target_company_id, 'windows', 'Windows', 'condition', 7),
    (target_company_id, 'air_conditioning', 'Air conditioning', 'condition', 8),
    (target_company_id, 'dashboard_warnings', 'Dashboard warnings', 'condition', 9),
    (target_company_id, 'vehicle_documents', 'Vehicle documents', 'documents_and_items', 10),
    (target_company_id, 'keys', 'Keys', 'documents_and_items', 11),
    (target_company_id, 'safety_equipment', 'Safety equipment', 'documents_and_items', 12),
    (target_company_id, 'accessories', 'Accessories supplied by the agency', 'documents_and_items', 13)
  on conflict (company_id, key) do nothing;
end;
$$;

revoke all on function public.seed_default_checklist(uuid) from public;
grant execute on function public.seed_default_checklist(uuid) to authenticated;
