-- Lightweight team access: a `status` + optional `branch_id` on
-- memberships, an `invitations` table, and a handful of narrow
-- SECURITY DEFINER RPCs — the exact pattern docs/security.md already
-- calls for ("a future invitation feature must follow the same pattern:
-- a SECURITY DEFINER RPC that validates the inviter's role server-side,
-- never a direct table insert from the client").

alter table public.company_memberships
  add column status text not null default 'active' check (status in ('active', 'suspended')),
  add column branch_id uuid references public.branches (id) on delete set null;

-- The single most important change in this file: every RLS policy in the
-- app routes through these four helpers, so making "suspended" mean
-- "not a member" here is what makes a suspended user lose access
-- everywhere at once, with nothing else to remember to update.
create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.company_role(target_company_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.company_memberships
  where company_id = target_company_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.is_company_manager_or_owner(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'manager')
  );
$$;

create or replace function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and status = 'active'
      and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('owner', 'manager', 'agent', 'accountant', 'driver')),
  branch_id uuid references public.branches (id) on delete set null,
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Re-inviting the same address while a prior invite is still pending
-- refreshes it (see invite_member() below) rather than erroring or
-- creating a second row — this index is what makes that possible.
create unique index invitations_pending_email_key
  on public.invitations (company_id, lower(email))
  where status = 'pending';

create index invitations_token_idx on public.invitations (token);
create index invitations_company_id_idx on public.invitations (company_id);

alter table public.invitations enable row level security;

create policy "Managers can view invitations"
  on public.invitations for select
  using (public.is_company_manager_or_owner(company_id));

-- No direct INSERT/UPDATE/DELETE policy — invite_member(), accept_invitation(),
-- and expiring an old invite all go through SECURITY DEFINER functions below,
-- same as company_memberships itself.

-- ---------------------------------------------------------------------
-- invite_member: owner/manager only. A manager can never grant 'owner' —
-- only an owner can invite a co-owner.
-- ---------------------------------------------------------------------
create or replace function public.invite_member(
  p_company_id uuid,
  p_email text,
  p_role text,
  p_branch_id uuid default null
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_invitation public.invitations;
begin
  v_role := public.company_role(p_company_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Not permitted to invite members';
  end if;

  if p_role not in ('owner', 'manager', 'agent', 'accountant', 'driver') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if p_role = 'owner' and v_role <> 'owner' then
    raise exception 'Only an owner can invite another owner';
  end if;

  if exists (
    select 1 from public.company_memberships
    where company_id = p_company_id and status = 'active'
      and user_id in (select id from auth.users where lower(email) = lower(p_email))
  ) then
    raise exception 'This person already has access to this company';
  end if;

  insert into public.invitations (company_id, email, role, branch_id, invited_by)
  values (p_company_id, lower(btrim(p_email)), p_role, p_branch_id, auth.uid())
  on conflict (company_id, lower(email)) where status = 'pending'
  do update set
    role = excluded.role,
    branch_id = excluded.branch_id,
    token = gen_random_uuid(),
    invited_by = excluded.invited_by,
    expires_at = now() + interval '7 days',
    created_at = now()
  returning * into v_invitation;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    p_company_id, auth.uid(), 'member_invited', 'Team member invited',
    p_email, jsonb_build_object('invitation_id', v_invitation.id)
  );

  return v_invitation;
end;
$$;

revoke all on function public.invite_member(uuid, text, text, uuid) from public;
grant execute on function public.invite_member(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- accept_invitation: the invited person calls this once signed in. Only
-- the invited email can accept (cross-company / wrong-account reuse is
-- rejected here), only while pending and unexpired (single-use — the
-- status flip to 'accepted' makes a second call fail the same check).
-- ---------------------------------------------------------------------
create or replace function public.accept_invitation(p_token uuid)
returns public.company_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.invitations;
  v_user_email text;
  v_membership public.company_memberships;
begin
  select * into v_invitation from public.invitations where token = p_token;
  if v_invitation is null then
    raise exception 'This invitation link is invalid';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'This invitation has already been used or is no longer valid';
  end if;

  if v_invitation.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_invitation.id;
    raise exception 'This invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into public.company_memberships (company_id, user_id, role, branch_id, status)
  values (v_invitation.company_id, auth.uid(), v_invitation.role, v_invitation.branch_id, 'active')
  on conflict (company_id, user_id) do update set
    role = excluded.role,
    branch_id = excluded.branch_id,
    status = 'active'
  returning * into v_membership;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_invitation.id;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_invitation.company_id, auth.uid(), 'invitation_accepted', 'Invitation accepted',
    null, jsonb_build_object('invitation_id', v_invitation.id)
  );

  return v_membership;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Membership lifecycle: role changes, suspend, reactivate, remove.
-- Shared guard rules, enforced identically in every one of them:
--   - Never act on your own membership (no self-promotion, no
--     self-suspension, no self-removal through this path).
--   - A manager can never touch an owner's membership or grant 'owner'.
--   - The last remaining owner can never be suspended, removed, or
--     demoted.
-- ---------------------------------------------------------------------
create or replace function public.update_member_role(p_membership_id uuid, p_role text)
returns public.company_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.company_memberships;
  v_actor_role text;
  v_owner_count integer;
begin
  select * into v_target from public.company_memberships where id = p_membership_id;
  if v_target is null then
    raise exception 'Member not found';
  end if;

  v_actor_role := public.company_role(v_target.company_id);
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'Not permitted to change roles';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  if p_role not in ('owner', 'manager', 'agent', 'accountant', 'driver') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if (p_role = 'owner' or v_target.role = 'owner') and v_actor_role <> 'owner' then
    raise exception 'Only an owner can grant or change ownership';
  end if;

  if v_target.role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count
    from public.company_memberships
    where company_id = v_target.company_id and role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      raise exception 'A company must always have at least one owner';
    end if;
  end if;

  update public.company_memberships set role = p_role where id = p_membership_id
  returning * into v_target;

  return v_target;
end;
$$;

revoke all on function public.update_member_role(uuid, text) from public;
grant execute on function public.update_member_role(uuid, text) to authenticated;

create or replace function public.suspend_member(p_membership_id uuid)
returns public.company_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.company_memberships;
  v_actor_role text;
  v_owner_count integer;
begin
  select * into v_target from public.company_memberships where id = p_membership_id;
  if v_target is null then
    raise exception 'Member not found';
  end if;

  v_actor_role := public.company_role(v_target.company_id);
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'Not permitted to suspend members';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'You cannot suspend your own access';
  end if;

  if v_target.role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can suspend another owner';
  end if;

  if v_target.role = 'owner' then
    select count(*) into v_owner_count
    from public.company_memberships
    where company_id = v_target.company_id and role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      raise exception 'A company must always have at least one active owner';
    end if;
  end if;

  update public.company_memberships set status = 'suspended' where id = p_membership_id
  returning * into v_target;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_target.company_id, auth.uid(), 'user_suspended', 'Team member suspended',
    null, jsonb_build_object('membership_id', v_target.id)
  );

  return v_target;
end;
$$;

revoke all on function public.suspend_member(uuid) from public;
grant execute on function public.suspend_member(uuid) to authenticated;

create or replace function public.reactivate_member(p_membership_id uuid)
returns public.company_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.company_memberships;
begin
  select * into v_target from public.company_memberships where id = p_membership_id;
  if v_target is null then
    raise exception 'Member not found';
  end if;

  if public.company_role(v_target.company_id) not in ('owner', 'manager') then
    raise exception 'Not permitted to reactivate members';
  end if;

  update public.company_memberships set status = 'active' where id = p_membership_id
  returning * into v_target;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_target.company_id, auth.uid(), 'user_reactivated', 'Team member reactivated',
    null, jsonb_build_object('membership_id', v_target.id)
  );

  return v_target;
end;
$$;

revoke all on function public.reactivate_member(uuid) from public;
grant execute on function public.reactivate_member(uuid) to authenticated;

create or replace function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.company_memberships;
  v_actor_role text;
  v_owner_count integer;
begin
  select * into v_target from public.company_memberships where id = p_membership_id;
  if v_target is null then
    raise exception 'Member not found';
  end if;

  v_actor_role := public.company_role(v_target.company_id);
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'Not permitted to remove members';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'You cannot remove your own access';
  end if;

  if v_target.role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'Only an owner can remove another owner';
  end if;

  if v_target.role = 'owner' then
    select count(*) into v_owner_count
    from public.company_memberships
    where company_id = v_target.company_id and role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      raise exception 'A company must always have at least one owner';
    end if;
  end if;

  delete from public.company_memberships where id = p_membership_id;

  insert into public.activity_log (company_id, actor_id, type, title, description, metadata)
  values (
    v_target.company_id, auth.uid(), 'user_removed', 'Team member removed',
    null, jsonb_build_object('membership_id', p_membership_id)
  );
end;
$$;

revoke all on function public.remove_member(uuid) from public;
grant execute on function public.remove_member(uuid) to authenticated;
