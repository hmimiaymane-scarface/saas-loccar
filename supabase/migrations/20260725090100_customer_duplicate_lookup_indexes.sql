-- Phase 04 — supports lib/customer-matching.ts#findDuplicateCandidates,
-- which scans a company's customers to score them against a candidate's
-- identity fields. `full_name` is scored client-side (fuzzy, not
-- index-friendly), but the two near-exact identity fields it also
-- compares — id_document_number and license_number — benefit from a
-- plain btree the same way customers_company_phone_idx already does for
-- phone-based duplicate detection.
create index customers_company_id_document_number_idx
  on public.customers (company_id, id_document_number)
  where id_document_number is not null;

create index customers_company_license_number_idx
  on public.customers (company_id, license_number)
  where license_number is not null;
