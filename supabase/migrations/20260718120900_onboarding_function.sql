-- Atomically creates a company, its owner membership and a main branch for
-- the currently authenticated user. This is the ONLY way a company or a
-- company_memberships row can be created in this phase — there is no
-- INSERT policy on either table for ordinary clients (see
-- 20260718120800_row_level_security.sql).
--
-- SECURITY DEFINER lets it write to company_memberships despite RLS, but it
-- is safe: the owner is always auth.uid() (never a client-supplied user
-- id), and it always creates a brand-new company row, so there is no way
-- to use this function to join or take over an existing company.
create or replace function public.create_company_with_owner(
  p_name text,
  p_city text default null,
  p_phone text default null,
  p_currency text default 'MAD',
  p_language text default 'fr'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_base_slug text;
  v_slug text;
  v_company_id uuid;
  v_attempt int := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Company name is required';
  end if;

  v_base_slug := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then
    v_base_slug := 'company';
  end if;

  v_slug := v_base_slug;
  while exists (select 1 from public.companies where slug = v_slug) loop
    v_attempt := v_attempt + 1;
    v_slug := v_base_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
    if v_attempt > 10 then
      raise exception 'Could not generate a unique company slug';
    end if;
  end loop;

  insert into public.companies (name, slug, city, phone, currency, default_language, status)
  values (btrim(p_name), v_slug, p_city, p_phone, coalesce(p_currency, 'MAD'), coalesce(p_language, 'fr'), 'active')
  returning id into v_company_id;

  insert into public.company_memberships (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner');

  insert into public.branches (company_id, name, city, phone, is_main)
  values (v_company_id, 'Main branch', p_city, p_phone, true);

  update public.profiles
  set phone = coalesce(p_phone, phone),
      preferred_language = coalesce(p_language, preferred_language)
  where id = v_user_id;

  insert into public.activity_log (company_id, actor_id, type, title, description)
  values (
    v_company_id,
    v_user_id,
    'member_invited',
    'Workspace created',
    'Company workspace created and owner assigned.'
  );

  return v_company_id;
end;
$$;

revoke all on function public.create_company_with_owner(text, text, text, text, text) from public;
grant execute on function public.create_company_with_owner(text, text, text, text, text) to authenticated;
