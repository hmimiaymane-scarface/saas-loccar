-- Human-readable, per-company reservation reference numbers (e.g. RB-1006).
-- A single shared sequence would leak how many bookings a competitor's
-- company has made; a per-company counter avoids that and reads better.
alter table public.companies
  add column reservation_sequence integer not null default 1000;

-- SECURITY DEFINER so any authenticated company member can call it without
-- needing UPDATE rights on companies (which RLS reserves for
-- owner/manager). Row-level UPDATE ... RETURNING serializes concurrent
-- callers for the same company via the row lock, so numbers never repeat
-- even if two reservations are created at the same instant.
create or replace function public.next_reservation_reference(target_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if not public.is_company_member(target_company_id) then
    raise exception 'Not a member of this company';
  end if;

  update public.companies
  set reservation_sequence = reservation_sequence + 1
  where id = target_company_id
  returning reservation_sequence into v_next;

  if v_next is null then
    raise exception 'Company not found';
  end if;

  return 'RB-' || v_next;
end;
$$;

revoke all on function public.next_reservation_reference(uuid) from public;
grant execute on function public.next_reservation_reference(uuid) to authenticated;
