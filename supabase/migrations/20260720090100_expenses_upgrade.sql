-- Widens the expense category list for this phase's expense tracker, and
-- links expenses to the maintenance record that generated them so a
-- completed maintenance job's cost is never counted twice (once as
-- maintenance_records.cost, once again as a separately-entered expense).
--
-- Chosen rule (documented here, enforced by complete_maintenance() in
-- 20260720090200_maintenance_functions.sql and by every report/summary
-- query that sums expenses): a completed maintenance record may create
-- *at most one* linked expense row (enforced by the unique index below).
-- Reports sum `expenses.amount` as the single source of truth for money
-- spent; maintenance_records.cost is kept purely as the record's own
-- estimated/actual cost fields for the maintenance UI, and is never
-- separately added into an expense total once a linked expense exists.

alter table public.expenses drop constraint expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (category in (
  'maintenance',
  'fuel',
  'cleaning',
  'insurance',
  'technical_inspection',
  'registration',
  'rent',
  'utilities',
  'marketing',
  'commission',
  'office_supplies',
  'tolls',
  'fines',
  'vehicle_purchase',
  'salary',
  'parking',
  'other'
));

alter table public.expenses
  add column maintenance_record_id uuid references public.maintenance_records (id) on delete set null,
  add column reservation_id uuid references public.reservations (id) on delete set null,
  add column method text check (method in ('cash', 'card', 'transfer', 'other')),
  add column notes text;

-- At most one expense per maintenance record — this is what makes
-- "may create or link to one expense record" a database guarantee rather
-- than an application-layer convention that could be bypassed by a bug.
create unique index expenses_maintenance_record_id_key
  on public.expenses (maintenance_record_id)
  where maintenance_record_id is not null;

create index expenses_vehicle_id_idx on public.expenses (vehicle_id);
create index expenses_company_category_idx on public.expenses (company_id, category);
