-- Read-side of the platform dashboard. Every function here is narrow and
-- purpose-built: each returns only the specific aggregate fields the
-- dashboard needs, never raw sensitive tenant rows (no customer names,
-- documents, licences, contracts, or full activity feeds — see the phase
-- brief's tenant privacy boundaries). Platform admins do not gain a
-- general-purpose escape hatch around RLS; they gain exactly these
-- counts and summaries.
--
-- All of these are `language plpgsql` (not `sql`) purely so the body can
-- start with `perform assert_platform_admin()` before returning anything
-- — a single-statement `language sql` function has no clean way to raise
-- first and select second.

create or replace function public.platform_get_overview()
returns table (
  total_companies bigint,
  active_subscriptions bigint,
  active_trials bigint,
  trials_ending_soon bigint,
  suspended_companies bigint,
  companies_active_recently bigint,
  total_vehicles bigint,
  reservations_created_recently bigint,
  documents_uploaded_this_month bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  select
    (select count(*) from public.companies),
    (select count(*) from public.company_subscriptions where status = 'active'),
    (select count(*) from public.company_subscriptions where status = 'trial'),
    (select count(*) from public.company_subscriptions
       where status = 'trial' and trial_ends_on between current_date and current_date + 7),
    (select count(*) from public.company_subscriptions where status = 'suspended'),
    (select count(distinct company_id) from public.activity_log where created_at > now() - interval '7 days'),
    (select count(*) from public.vehicles),
    (select count(*) from public.reservations where created_at > now() - interval '7 days'),
    (select count(*) from public.documents where created_at >= date_trunc('month', now()));
end;
$$;

create or replace function public.platform_list_companies(
  p_search text default null,
  p_status text default null,
  p_sort text default 'activity',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  company_id uuid,
  name text,
  city text,
  owner_email text,
  subscription_status text,
  plan_label text,
  trial_or_renewal_date date,
  vehicle_count bigint,
  reservation_count bigint,
  last_activity_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  with owner as (
    select cm.company_id, u.email
    from public.company_memberships cm
    join auth.users u on u.id = cm.user_id
    where cm.role = 'owner' and cm.status = 'active'
    order by cm.created_at
    limit 1
  ),
  activity as (
    select al.company_id, max(al.created_at) as last_activity_at
    from public.activity_log al
    group by al.company_id
  ),
  vcount as (
    select v.company_id, count(*) as vehicle_count from public.vehicles v group by v.company_id
  ),
  rcount as (
    select r.company_id, count(*) as reservation_count from public.reservations r group by r.company_id
  )
  select
    c.id,
    c.name,
    c.city,
    o.email,
    cs.status,
    cs.plan_label,
    case when cs.status = 'trial' then cs.trial_ends_on else cs.subscription_ends_on end,
    coalesce(vc.vehicle_count, 0),
    coalesce(rc.reservation_count, 0),
    act.last_activity_at,
    c.created_at,
    count(*) over ()
  from public.companies c
  left join public.company_subscriptions cs on cs.company_id = c.id
  left join owner o on o.company_id = c.id
  left join activity act on act.company_id = c.id
  left join vcount vc on vc.company_id = c.id
  left join rcount rc on rc.company_id = c.id
  where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%')
    and (p_status is null or p_status = '' or cs.status = p_status)
  order by
    case when p_sort = 'created_at' then c.created_at end desc nulls last,
    case when p_sort <> 'created_at' then act.last_activity_at end desc nulls last
  limit greatest(p_page_size, 1)
  offset greatest(p_page - 1, 0) * greatest(p_page_size, 1);
end;
$$;

create or replace function public.platform_get_company_summary(p_company_id uuid)
returns table (
  name text,
  city text,
  owner_email text,
  owner_full_name text,
  created_at timestamptz,
  user_count bigint,
  branch_count bigint,
  vehicle_count bigint,
  customer_count bigint,
  reservation_count bigint,
  active_rental_count bigint,
  document_count bigint,
  documents_this_month_count bigint,
  last_activity_at timestamptz,
  subscription_status text,
  plan_label text,
  trial_starts_on date,
  trial_ends_on date,
  subscription_starts_on date,
  subscription_ends_on date,
  monthly_price_mad numeric,
  currency text,
  notes text,
  notes_updated_at timestamptz,
  notes_updated_by_email text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  select
    c.name,
    c.city,
    o.email,
    p.full_name,
    c.created_at,
    (select count(*) from public.company_memberships where company_id = p_company_id and status = 'active'),
    (select count(*) from public.branches where company_id = p_company_id),
    (select count(*) from public.vehicles where company_id = p_company_id),
    (select count(*) from public.customers where company_id = p_company_id),
    (select count(*) from public.reservations where company_id = p_company_id),
    (select count(*) from public.reservations where company_id = p_company_id and status = 'active'),
    (select count(*) from public.documents where company_id = p_company_id),
    (select count(*) from public.documents where company_id = p_company_id and created_at >= date_trunc('month', now())),
    (select max(created_at) from public.activity_log where company_id = p_company_id),
    cs.status,
    cs.plan_label,
    cs.trial_starts_on,
    cs.trial_ends_on,
    cs.subscription_starts_on,
    cs.subscription_ends_on,
    cs.monthly_price_mad,
    cs.currency,
    cs.notes,
    cs.updated_at,
    updater.email
  from public.companies c
  left join public.company_subscriptions cs on cs.company_id = c.id
  left join lateral (
    select cm.user_id
    from public.company_memberships cm
    where cm.company_id = c.id and cm.role = 'owner' and cm.status = 'active'
    order by cm.created_at
    limit 1
  ) owner_membership on true
  left join auth.users o on o.id = owner_membership.user_id
  left join public.profiles p on p.id = owner_membership.user_id
  left join auth.users updater on updater.id = cs.updated_by
  where c.id = p_company_id;
end;
$$;

create or replace function public.platform_get_company_events(p_company_id uuid, p_limit integer default 20)
returns table (
  id uuid,
  admin_email text,
  action text,
  description text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query
  select pal.id, u.email, pal.action, pal.description, pal.created_at
  from public.platform_audit_log pal
  left join auth.users u on u.id = pal.admin_id
  where pal.company_id = p_company_id
  order by pal.created_at desc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.platform_get_overview() from public;
revoke all on function public.platform_list_companies(text, text, text, integer, integer) from public;
revoke all on function public.platform_get_company_summary(uuid) from public;
revoke all on function public.platform_get_company_events(uuid, integer) from public;

grant execute on function public.platform_get_overview() to authenticated;
grant execute on function public.platform_list_companies(text, text, text, integer, integer) to authenticated;
grant execute on function public.platform_get_company_summary(uuid) to authenticated;
grant execute on function public.platform_get_company_events(uuid, integer) to authenticated;
