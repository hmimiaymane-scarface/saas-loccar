-- Found via productization wave 1 phase 7's real-pipeline validation:
-- `storage.objects`' read policy (20260719090700_storage.sql) only ever
-- checked `is_company_member`, never the app-layer `download_documents`
-- permission (phase 19, has_permission(company_id, 'download_documents'))
-- that gates the `documents` table's own SELECT policy. A Staff member
-- with that permission switched off (productization wave 1 phase 3's
-- "Can edit or delete important records" toggle) correctly lost the
-- ability to see a `documents` row, but if they already knew or could
-- guess the exact storage path, `createSignedUrl()` still succeeded —
-- confirmed live against the real project before this fix.
--
-- Scoped narrowly to paths whose second segment is literally
-- "documents" (the convention `new-document-form.tsx`/
-- `document-upload-row.tsx` use — see lib/storage.ts#buildStoragePath
-- call sites) — every other upload path (damages, contract-templates,
-- expenses, maintenance, customers/onboarding, inspections) keeps the
-- unchanged company-membership-only read gate; `download_documents`
-- has never meant "sensitive company files in general," only the
-- documents table/feature specifically, and widening this to the whole
-- bucket would incorrectly block damage photos, contract PDFs, etc.
-- for roles that were always meant to read those.
drop policy "Company members can read their files" on storage.objects;

create policy "Company members can read their files"
  on storage.objects for select
  using (
    bucket_id = 'company-files'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
    and (
      (storage.foldername(name))[2] is distinct from 'documents'
      or public.has_permission((storage.foldername(name))[1]::uuid, 'download_documents')
    )
  );
