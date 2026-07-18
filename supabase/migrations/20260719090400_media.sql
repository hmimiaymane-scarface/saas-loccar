-- Operational photos (inspection shots, odometer, fuel gauge, damage
-- close-ups). Polymorphic on purpose — an inspection and a damage record
-- both need a photo gallery, and a third entity type may need one later —
-- but the entity_id has no FK (Postgres can't FK to "one of two tables"),
-- so RLS must validate the referenced row's company itself. See
-- media_entity_company_id() in 20260719090800_handoff_rls.sql for exactly
-- how that closes the "manipulated entity ID" hole the brief calls out.
create table public.media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entity_type text not null check (entity_type in ('inspection', 'damage')),
  entity_id uuid not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  caption text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index media_company_id_idx on public.media (company_id);
create index media_entity_idx on public.media (entity_type, entity_id);
