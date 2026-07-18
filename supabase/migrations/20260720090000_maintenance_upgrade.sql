-- Upgrades maintenance_records for the owner-operating-system phase: a
-- fuller status lifecycle (planned before scheduled, waiting_for_parts
-- mid-repair), a priority field, a started_on date so "in progress since"
-- is a real fact instead of inferred from updated_at, and a wider category
-- list. `type` already meant "category of work" — kept the column name to
-- avoid touching every existing reference, just widened what it accepts.

alter table public.maintenance_records drop constraint maintenance_records_status_check;
alter table public.maintenance_records add constraint maintenance_records_status_check check (status in (
  'planned',
  'scheduled',
  'in_progress',
  'waiting_for_parts',
  'completed',
  'cancelled'
));

-- Kept 'tire'/'brake' singular (not 'tires'/'brakes') to match the rest of
-- this list and avoid rewriting existing rows/seed data — the brief's
-- "Tyres"/"Brakes" wording is a UI label choice (see lib/status.ts), not a
-- requirement on the stored value.
alter table public.maintenance_records drop constraint maintenance_records_type_check;
alter table public.maintenance_records add constraint maintenance_records_type_check check (type in (
  'oil_change',
  'tire',
  'brake',
  'battery',
  'engine',
  'transmission',
  'air_conditioning',
  'bodywork',
  'cleaning',
  'inspection',
  'insurance_renewal',
  'registration_renewal',
  'routine_service',
  'repair',
  'other'
));

alter table public.maintenance_records
  add column priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column started_on date,
  add column receipt_path text;

-- Estimated and actual cost as two distinct fields (mirrors damages.
-- estimated_cost/actual_cost from the handoff phase) rather than one
-- column that gets silently overwritten — the owner should be able to
-- see the estimate they were quoted next to what it actually cost.
alter table public.maintenance_records rename column cost to estimated_cost;
alter table public.maintenance_records add column actual_cost numeric(10, 2) check (actual_cost >= 0);

comment on column public.maintenance_records.type is
  'Category of maintenance work (kept the original column name — see migration comment).';
