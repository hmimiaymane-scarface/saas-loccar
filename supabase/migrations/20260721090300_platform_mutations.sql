-- Every platform-owner mutation goes through one of these — never a
-- direct client update, since company_subscriptions has no INSERT/UPDATE
-- policy at all. Each function re-checks is_platform_admin() itself even
-- though only a platform admin could reach the surrounding app code, so
-- that the real enforcement lives at the same layer as the actual write
-- (defense in depth: a compromised or buggy server action still can't
-- mutate this table without passing this check).

create or replace function public.assert_platform_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_platform_admin() from public;

-- Any authenticated user may ask "is this specific company suspended?" —
-- a single boolean, not the subscription row itself (no pricing, no
-- notes, no dates). This is what the tenant-facing middleware uses to
-- redirect a suspended company's users to the account-status page.
create or replace function public.is_company_suspended(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select status in ('suspended', 'cancelled')
     from public.company_subscriptions
     where company_id = target_company_id),
    false
  );
$$;

revoke all on function public.is_company_suspended(uuid) from public;
grant execute on function public.is_company_suspended(uuid) to authenticated;

create or replace function public.platform_set_subscription_status(
  p_company_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_status not in ('trial', 'active', 'suspended', 'cancelled') then
    raise exception 'Invalid subscription status.';
  end if;

  update public.company_subscriptions
  set status = p_status, updated_by = auth.uid()
  where company_id = p_company_id;

  if not found then
    raise exception 'No subscription record for that company.';
  end if;

  perform public.log_platform_action(
    p_company_id,
    case p_status
      when 'active' then 'subscription_activated'
      when 'suspended' then 'company_suspended'
      when 'cancelled' then 'subscription_cancelled'
      else 'company_reactivated'
    end,
    p_reason
  );
end;
$$;

create or replace function public.platform_start_or_extend_trial(
  p_company_id uuid,
  p_trial_ends_on date,
  p_trial_starts_on date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_trial_ends_on <= coalesce(p_trial_starts_on, current_date) then
    raise exception 'Trial end date must be after the start date.';
  end if;

  update public.company_subscriptions
  set
    status = 'trial',
    trial_starts_on = coalesce(p_trial_starts_on, trial_starts_on, current_date),
    trial_ends_on = p_trial_ends_on,
    updated_by = auth.uid()
  where company_id = p_company_id;

  if not found then
    raise exception 'No subscription record for that company.';
  end if;

  perform public.log_platform_action(
    p_company_id,
    'trial_extended',
    format('Trial set to end %s', p_trial_ends_on)
  );
end;
$$;

create or replace function public.platform_update_subscription_dates(
  p_company_id uuid,
  p_subscription_starts_on date,
  p_subscription_ends_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_subscription_ends_on is not null and p_subscription_starts_on is not null
     and p_subscription_ends_on <= p_subscription_starts_on then
    raise exception 'Renewal date must be after the start date.';
  end if;

  update public.company_subscriptions
  set
    subscription_starts_on = p_subscription_starts_on,
    subscription_ends_on = p_subscription_ends_on,
    updated_by = auth.uid()
  where company_id = p_company_id;

  if not found then
    raise exception 'No subscription record for that company.';
  end if;

  perform public.log_platform_action(p_company_id, 'subscription_dates_updated', null);
end;
$$;

create or replace function public.platform_update_plan(
  p_company_id uuid,
  p_plan_label text,
  p_monthly_price_mad numeric,
  p_currency text default 'MAD'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_monthly_price_mad is not null and p_monthly_price_mad < 0 then
    raise exception 'Monthly price cannot be negative.';
  end if;

  update public.company_subscriptions
  set
    plan_label = p_plan_label,
    monthly_price_mad = p_monthly_price_mad,
    currency = coalesce(p_currency, currency),
    updated_by = auth.uid()
  where company_id = p_company_id;

  if not found then
    raise exception 'No subscription record for that company.';
  end if;

  perform public.log_platform_action(
    p_company_id,
    'plan_label_changed',
    format('Plan set to %s', p_plan_label)
  );
end;
$$;

create or replace function public.platform_update_notes(
  p_company_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_admin();

  update public.company_subscriptions
  set notes = p_notes, updated_by = auth.uid()
  where company_id = p_company_id;

  if not found then
    raise exception 'No subscription record for that company.';
  end if;

  perform public.log_platform_action(p_company_id, 'internal_note_updated', null);
end;
$$;

revoke all on function public.platform_set_subscription_status(uuid, text, text) from public;
revoke all on function public.platform_start_or_extend_trial(uuid, date, date) from public;
revoke all on function public.platform_update_subscription_dates(uuid, date, date) from public;
revoke all on function public.platform_update_plan(uuid, text, numeric, text) from public;
revoke all on function public.platform_update_notes(uuid, text) from public;

grant execute on function public.platform_set_subscription_status(uuid, text, text) to authenticated;
grant execute on function public.platform_start_or_extend_trial(uuid, date, date) to authenticated;
grant execute on function public.platform_update_subscription_dates(uuid, date, date) to authenticated;
grant execute on function public.platform_update_plan(uuid, text, numeric, text) to authenticated;
grant execute on function public.platform_update_notes(uuid, text) to authenticated;
