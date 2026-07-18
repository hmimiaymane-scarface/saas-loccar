-- Strengthens `payments` into a real transaction ledger, and moves deposit
-- state off `reservations` onto the new `deposits` table so there is one
-- source of truth instead of two fields that can silently disagree.

-- 1. Transaction type + direction. `amount` stays a positive magnitude in
--    every row; `direction` says which way the money moved, so a refund
--    or deposit return can never be mistaken for revenue.
alter table public.payments
  add column transaction_type text not null default 'rental_payment' check (transaction_type in (
    'rental_payment',
    'deposit_collection',
    'deposit_return',
    'refund',
    'damage_charge',
    'additional_charge'
  ));

alter table public.payments
  add column direction text generated always as (
    case
      when transaction_type in ('deposit_return', 'refund') then 'out'
      else 'in'
    end
  ) stored;

alter table public.payments alter column transaction_type drop default;

create index payments_company_type_idx on public.payments (company_id, transaction_type);

-- 2. Migrate deposit_amount off reservations and onto deposits (safe: no
--    production data exists yet against this schema — this is the initial
--    rollout of the deposits table, not a later refactor).
insert into public.deposits (company_id, reservation_id, status, expected_amount, created_by)
select company_id, id, case when deposit_amount > 0 then 'expected' else 'not_required' end, coalesce(deposit_amount, 0), created_by
from public.reservations
where deposit_amount is not null and deposit_amount > 0
on conflict (reservation_id) do nothing;

alter table public.reservations drop column deposit_amount;

-- 3. `reservations.amount_paid` becomes a maintained cache of the ledger,
--    not a directly-editable field. Only `rental_payment` transactions
--    count toward it — deposits, refunds and charges are tracked
--    separately and must never inflate rental revenue or the rental
--    balance. SECURITY DEFINER because accountants can record payments
--    but don't otherwise have UPDATE rights on `reservations`.
create or replace function public.sync_reservation_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_id uuid;
  v_total numeric(10, 2);
begin
  v_reservation_id := coalesce(new.reservation_id, old.reservation_id);
  if v_reservation_id is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into v_total
  from public.payments
  where reservation_id = v_reservation_id
    and transaction_type = 'rental_payment';

  update public.reservations
  set amount_paid = v_total
  where id = v_reservation_id;

  return coalesce(new, old);
end;
$$;

create trigger payments_sync_reservation_amount_paid
  after insert or update or delete on public.payments
  for each row execute function public.sync_reservation_amount_paid();

comment on column public.reservations.amount_paid is
  'Maintained by payments_sync_reservation_amount_paid — do not write to this column directly from application code. Sum of rental_payment transactions in public.payments for this reservation.';
