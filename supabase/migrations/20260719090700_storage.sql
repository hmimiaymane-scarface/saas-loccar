-- One private bucket for every uploaded file in this phase (contracts,
-- customer documents, inspection/damage photos). Storage path convention
-- is load-bearing for security, not just organization:
--
--   {company_id}/{category}/{...segments}/{filename}
--
-- Policies below extract the first path segment with
-- storage.foldername(name) and check it against real membership rows via
-- is_company_member() / is_company_manager_or_owner() — the same helper
-- functions the table RLS policies use. A path segment alone proves
-- nothing; the membership lookup is what actually authorizes access, so a
-- forged or guessed company_id in a path still gets rejected.
insert into storage.buckets (id, name, public)
values ('company-files', 'company-files', false)
on conflict (id) do nothing;

create policy "Company members can read their files"
  on storage.objects for select
  using (
    bucket_id = 'company-files'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
  );

create policy "Company members can upload their files"
  on storage.objects for insert
  with check (
    bucket_id = 'company-files'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
  );

-- Replacing a file (e.g. re-uploading a clearer photo) needs UPDATE too.
create policy "Company members can replace their files"
  on storage.objects for update
  using (
    bucket_id = 'company-files'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'company-files'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
  );

-- Deleting evidence is a manager/owner action, not an ordinary agent one —
-- matches "Unauthorized roles cannot delete completed evidence".
create policy "Managers can delete their company's files"
  on storage.objects for delete
  using (
    bucket_id = 'company-files'
    and public.is_company_manager_or_owner((storage.foldername(name))[1]::uuid)
  );
