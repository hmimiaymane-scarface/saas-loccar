-- Phase 10 of the RentalOS build roadmap ("Dynamic Contract Engine:
-- Templates & Variable Mapping") — bible Chapter 8. No contract engine
-- of any kind existed before this migration.
--
-- Three tables, deliberately split so version history is real and
-- immutable rather than bolted on with a JSON audit trail:
--
--   contract_templates          — one row per named template a company
--                                  maintains (e.g. "Standard rental
--                                  agreement", "Luxury fleet addendum").
--   contract_template_versions  — every edit is a NEW row, never an
--                                  update to sections/variable_mappings
--                                  on an existing one. `active_version_id`
--                                  on the parent is the only thing that
--                                  moves when a new version goes live.
--   contracts                   — a generated contract. Pins
--                                  template_version_id forever (a
--                                  contract generated from version 3
--                                  stays on version 3 even after the
--                                  template moves to version 4 — the
--                                  bible's own legal-defensibility
--                                  requirement) and snapshots the fully
--                                  resolved variable values into
--                                  resolved_context/rendered_sections
--                                  so the displayed contract never
--                                  silently changes even if the
--                                  customer/vehicle/reservation rows
--                                  it was built from are edited later.
--                                  The PDF (pdf_storage_path) is a
--                                  regeneratable rendering of that
--                                  jsonb, not the source of truth.
create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  -- Structurally required by requirement 5 even though only one
  -- language is actually implemented this phase — see docs/contracts.md.
  language text not null default 'fr',
  active_version_id uuid,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.contract_templates (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  version_number integer not null,
  -- pending_review: AI proposed it, nobody has confirmed it yet — never
  -- usable to generate a contract (requirement 2's non-negotiable).
  -- active: reviewed and confirmed, at most one per template is also
  -- pointed at by contract_templates.active_version_id.
  -- archived: superseded by a newer version; kept forever, never deleted.
  status text not null default 'pending_review' check (status in ('pending_review', 'active', 'archived')),
  -- Raw storage path of the originally-uploaded PDF, not a `documents`
  -- row: that table requires every row to link to a reservation,
  -- customer, or vehicle (see documents/actions.ts#createDocumentRecord),
  -- but a template source file belongs to the company generally, tied
  -- to none of those three.
  source_storage_path text,
  -- Ordered array of {id, title, bodyText, condition} — condition is
  -- either null (always included) or {fieldPath, operator, value?}, the
  -- deliberately-simple "field equals/exists" model requirement 4 asks
  -- for instead of a full rules DSL. See lib/contracts/template-engine.ts.
  sections jsonb not null default '[]'::jsonb,
  -- Array of {placeholder, fieldPath, label} — what the AI proposed (or
  -- the owner corrected) mapping template mentions to real business
  -- fields. See lib/contracts/variables.ts for the fixed field catalog.
  variable_mappings jsonb not null default '[]'::jsonb,
  legal_footer_text text,
  ai_notes text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (template_id, version_number)
);

alter table public.contract_templates
  add constraint contract_templates_active_version_fk
  foreign key (active_version_id) references public.contract_template_versions (id);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id),
  template_version_id uuid not null references public.contract_template_versions (id),
  customer_id uuid not null references public.customers (id),
  vehicle_id uuid references public.vehicles (id),
  resolved_context jsonb not null,
  rendered_sections jsonb not null,
  pdf_storage_path text,
  generated_by uuid references public.profiles (id),
  generated_at timestamptz not null default now(),
  unique (reservation_id, template_version_id)
);

create index contract_templates_company_idx on public.contract_templates (company_id);
create index contract_template_versions_template_idx on public.contract_template_versions (template_id, version_number);
create index contracts_company_reservation_idx on public.contracts (company_id, reservation_id);

alter table public.contract_templates enable row level security;
alter table public.contract_template_versions enable row level security;
alter table public.contracts enable row level security;

create policy "Members can view contract templates"
  on public.contract_templates for select
  using (public.is_company_member(company_id));

-- Template creation/editing is administrative — same owner/manager gate
-- as fleet edits and maintenance, not the wider front-desk set.
create policy "Owners and managers can manage contract templates"
  on public.contract_templates for all
  using (public.company_role(company_id) in ('owner', 'manager'))
  with check (public.company_role(company_id) in ('owner', 'manager'));

create policy "Members can view contract template versions"
  on public.contract_template_versions for select
  using (public.is_company_member(company_id));

create policy "Owners and managers can manage contract template versions"
  on public.contract_template_versions for all
  using (public.company_role(company_id) in ('owner', 'manager'))
  with check (public.company_role(company_id) in ('owner', 'manager'));

create policy "Members can view contracts"
  on public.contracts for select
  using (public.is_company_member(company_id));

-- Generating a contract from a reservation is front-desk work, same
-- role set as completing a rental.
create policy "Front-desk roles can generate contracts"
  on public.contracts for insert
  with check (public.company_role(company_id) in ('owner', 'manager', 'agent'));

-- No update/delete policy on contracts — a generated contract is
-- immutable; a mistake is superseded by generating a fresh one against
-- a newer template version, not edited in place (phase 11's lifecycle
-- states are what will formally supersede/void one).
