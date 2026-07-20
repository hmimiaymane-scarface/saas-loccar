-- Phase 03 of the RentalOS build roadmap ("Document Intelligence
-- Engine: Ingestion & OCR"). One row per extraction attempt, never
-- updated in place — the same append-only-history philosophy as
-- activity_log (see 20260723090000_event_backbone.sql): re-extracting
-- a document creates a new row rather than overwriting the last result,
-- so a bad extraction never silently erases a good one, and failures
-- stay visible instead of being discarded.
--
-- `category` is a snapshot of documents.category at extraction time
-- (not a live join) — deliberately narrower than the full
-- DocumentCategory list on `documents` itself, since only four of the
-- nine categories have an extraction schema (see
-- lib/document-extraction.ts#schemaForCategory); the rest are rejected
-- before ever reaching the model.
create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  category text not null check (category in (
    'identity_document', 'driving_licence', 'vehicle_registration', 'insurance_document'
  )),
  status text not null check (status in ('completed', 'failed')),
  fields jsonb,
  error_message text,
  model text not null,
  created_at timestamptz not null default now(),
  check (status = 'completed' and fields is not null and error_message is null
      or status = 'failed' and fields is null and error_message is not null)
);

create index document_extractions_company_document_idx
  on public.document_extractions (company_id, document_id, created_at desc);

alter table public.document_extractions enable row level security;

create policy "Members can view document extractions"
  on public.document_extractions for select
  using (public.is_company_member(company_id));

-- Mirrors "Front-desk roles can upload documents" in
-- 20260719090800_handoff_rls.sql: same roles, same defensive re-check
-- that the referenced row actually belongs to this company.
create policy "Front-desk roles can record document extractions"
  on public.document_extractions for insert
  with check (
    public.company_role(company_id) in ('owner', 'manager', 'agent')
    and exists (
      select 1 from public.documents d where d.id = document_id and d.company_id = document_extractions.company_id
    )
  );

-- No UPDATE/DELETE policy for anyone — append-only by design, same as
-- activity_log.
