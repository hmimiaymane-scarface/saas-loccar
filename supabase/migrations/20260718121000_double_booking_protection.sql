-- Database-level double-booking protection.
--
-- Business rule (documented here because it's the one place this decision
-- should live): a reservation "blocks" a vehicle for its pickup-return
-- window only while it is 'pending', 'confirmed' or 'active'.
--   - 'request' does NOT block. A request is an unvetted inbound ask —
--     several customers may request the same car; the exclusion only
--     kicks in once staff move it to 'pending' or 'confirmed'.
--   - 'completed', 'cancelled', 'no_show' do NOT block — the vehicle is
--     free again (or never actually left).
--
-- This is enforced with a Postgres EXCLUDE constraint, not application
-- code: two concurrent inserts/updates for the same vehicle with
-- overlapping periods are impossible even under a race, because Postgres
-- evaluates the constraint transactionally at the index level. This is
-- the "database constraint" option from the phase brief — sufficient on
-- its own without an additional locking RPC.
create extension if not exists btree_gist;

alter table public.reservations
  add column period tstzrange generated always as (
    tstzrange(pickup_at, return_at, '[)')
  ) stored;

alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    vehicle_id with =,
    period with &&
  )
  where (vehicle_id is not null and status in ('pending', 'confirmed', 'active'));

comment on constraint reservations_no_overlap on public.reservations is
  'Prevents two pending/confirmed/active reservations from claiming the same vehicle for overlapping periods. Violated inserts/updates fail with SQLSTATE 23P01 (exclusion_violation); the app layer maps this to a friendly "vehicle no longer available" error.';
