-- The accept-invitation page needs to show "you've been invited to join
-- <company> as <role>" before the person is a member of that company —
-- at that point they can't read `companies` or `invitations` under the
-- normal member-only policies. Rather than widening either table's RLS
-- for this one case, a narrow SECURITY DEFINER function returns just the
-- preview fields, and only for the invitation matching the caller's own
-- auth email (never a client-supplied email) — the same "prove identity
-- server-side, not by trusting the client" pattern as everywhere else.
create or replace function public.get_invitation_preview(p_token uuid)
returns table (
  invitation_id uuid,
  company_name text,
  role text,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();

  return query
  select i.id, c.name, i.role, i.status, i.expires_at
  from public.invitations i
  join public.companies c on c.id = i.company_id
  where i.token = p_token
    and v_email is not null
    and lower(i.email) = lower(v_email);
end;
$$;

revoke all on function public.get_invitation_preview(uuid) from public;
grant execute on function public.get_invitation_preview(uuid) to authenticated;

-- The Employees page needs to show each teammate's email (profiles has no
-- email column, and authenticated clients have no direct grant on
-- auth.users). Narrow on purpose: only returns emails for users who are
-- an ACTIVE member of a company the caller is a manager/owner of — never
-- an arbitrary uuid lookup.
create or replace function public.get_member_emails(p_user_ids uuid[])
returns table (user_id uuid, email text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email
  from auth.users u
  where u.id = any(p_user_ids)
    and exists (
      select 1
      from public.company_memberships caller_m
      join public.company_memberships target_m
        on target_m.company_id = caller_m.company_id
      where caller_m.user_id = auth.uid()
        and caller_m.status = 'active'
        and caller_m.role in ('owner', 'manager')
        and target_m.user_id = u.id
    );
$$;

revoke all on function public.get_member_emails(uuid[]) from public;
grant execute on function public.get_member_emails(uuid[]) to authenticated;
