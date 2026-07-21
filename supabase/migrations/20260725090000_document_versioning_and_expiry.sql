-- Phase 04 of the RentalOS build roadmap ("Document Intelligence Engine:
-- Classification, Expiry & Relationships"). Two additive columns on the
-- existing `documents` table rather than a new table — entity linking
-- (customer/vehicle/reservation) already existed since the phase-00
-- schema, so this phase only needs to add what's missing: a queryable
-- expiry date and a version-chain pointer.
--
-- `expires_on` mirrors the pattern already used on `vehicles`
-- (insurance/registration/inspection_expires_on) and `customers`
-- (license_expires_on) — a plain queryable date column, not something
-- buried in document_extractions.fields jsonb, so "documents expiring in
-- the next N days for this tenant" can be a real indexed query. Nothing
-- populates it automatically on manual upload (that would require
-- product-facing UI changes deferred to phase 14) — it's set either by
-- the classification/extraction pipeline (lib/documents.ts#recordDetectedExpiry)
-- or, for the four types with an extraction schema, callable directly.
--
-- `replaces_document_id` is the version-chain pointer: uploading a
-- renewed licence/insurance/registration for the same entity+category
-- sets this on the new row and flips the old row's `status` to
-- 'replaced' (that status value already existed in the check constraint
-- from the original documents migration — it was simply unused until
-- now). Old versions are never deleted, only superseded — same
-- append-only-history principle as phase 01's event backbone.
alter table public.documents
  add column expires_on date,
  add column replaces_document_id uuid references public.documents (id) on delete set null;

-- Powers getExpiringDocuments()'s "expires_on <= threshold" scan,
-- scoped to the rows that matter (active, has an expiry at all).
create index documents_company_expires_on_idx
  on public.documents (company_id, expires_on)
  where status = 'active' and expires_on is not null;

create index documents_replaces_document_id_idx
  on public.documents (replaces_document_id)
  where replaces_document_id is not null;

-- Powers findSupersededDocument()'s "does this entity already have an
-- active document of this category" lookup — the hot path on every
-- document upload.
create index documents_company_category_status_idx
  on public.documents (company_id, category, status);
