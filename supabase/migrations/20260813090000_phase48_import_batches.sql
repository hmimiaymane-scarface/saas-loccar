-- Roadmap phase 48 (Excel/CSV Importer). Adds:
--   1. import_batches — one row per commit of a CSV import, so a batch of
--      newly-created vehicles/customers can be found and (best-effort)
--      undone as a group, and so the /import page can show recent
--      imports without re-deriving anything from activity_log.
--   2. import_batch_id on vehicles/customers — nullable, set only on
--      rows created through the importer; ordinary single-record
--      creation leaves it null.
--   3. Two new activity_log types (vehicles_imported/customers_imported)
--      and one new entity_type (import_batch) for the one batch-level
--      event recorded per commit — see lib/import/ and
--      app/(dashboard)/import/actions.ts.

-- ---------------------------------------------------------------------
-- 1. import_batches
-- ---------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entity_type text not null check (entity_type in ('vehicle', 'customer')),
  created_by uuid references auth.users (id) on delete set null,
  row_count integer not null default 0,
  error_count integer not null default 0,
  -- Set only once every row tagged with this batch has been removed —
  -- see undoImportBatch's per-row delete loop. A batch that's only
  -- partially undoable (some rows now referenced by a reservation)
  -- stays null here so it keeps showing up as "undo again later".
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.import_batches enable row level security;

create policy "Managers can view import batches"
  on public.import_batches for select
  using (public.is_company_manager_or_owner(company_id));

create policy "Managers can create import batches"
  on public.import_batches for insert
  with check (public.is_company_manager_or_owner(company_id));

create policy "Managers can update import batches"
  on public.import_batches for update
  using (public.is_company_manager_or_owner(company_id))
  with check (public.is_company_manager_or_owner(company_id));

-- No DELETE policy: a batch row itself is never deleted, only the
-- vehicles/customers it created (via undoImportBatch) and its own
-- undone_at marker updated in place.

create index import_batches_company_created_idx on public.import_batches (company_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. import_batch_id on vehicles / customers
-- ---------------------------------------------------------------------
alter table public.vehicles
  add column import_batch_id uuid references public.import_batches (id) on delete set null;

alter table public.customers
  add column import_batch_id uuid references public.import_batches (id) on delete set null;

create index vehicles_import_batch_idx on public.vehicles (import_batch_id) where import_batch_id is not null;
create index customers_import_batch_idx on public.customers (import_batch_id) where import_batch_id is not null;

-- ---------------------------------------------------------------------
-- 3. activity_log: new types + entity_type, mirroring types/rental.ts's
--    ACTIVITY_TYPES/ENTITY_TYPES arrays (see
--    lib/__tests__/activity-log.test.ts's drift-guard test).
-- ---------------------------------------------------------------------
alter table public.activity_log drop constraint activity_log_type_check;
alter table public.activity_log add constraint activity_log_type_check check (type in (
  'reservation_requested',
  'reservation_confirmed',
  'reservation_status_changed',
  'reservation_updated',
  'reservation_cancelled',
  'payment_recorded',
  'payment_refunded',
  'vehicle_picked_up',
  'vehicle_returned',
  'vehicle_status_changed',
  'maintenance_completed',
  'customer_created',
  'customer_updated',
  'document_uploaded',
  'member_invited',
  'pickup_started',
  'return_started',
  'inspection_completed',
  'inspection_corrected',
  'damage_recorded',
  'damage_resolved',
  'deposit_collected',
  'deposit_returned',
  'deposit_retained',
  'maintenance_scheduled',
  'vehicle_entered_maintenance',
  'maintenance_cancelled',
  'expense_recorded',
  'user_suspended',
  'user_reactivated',
  'user_removed',
  'invitation_accepted',
  'rental_extended',
  'contract_generated',
  'contract_signed',
  'contract_prepared',
  'contract_sent_for_signature',
  'contract_activated',
  'contract_completed',
  'contract_archived',
  'contract_cancelled',
  'contract_amended',
  'contract_viewed',
  'contract_printed',
  'contract_downloaded',
  'template_created',
  'template_version_activated',
  'document_viewed',
  'document_downloaded',
  'permission_override_granted',
  'permission_override_revoked',
  'whatsapp_confirmation_sent',
  'whatsapp_pickup_reminder_sent',
  'whatsapp_return_reminder_sent',
  'whatsapp_payment_reminder_sent',
  'whatsapp_contract_sent',
  'call_logged',
  -- New for phase 48:
  'vehicles_imported',
  'customers_imported'
));

alter table public.activity_log drop constraint activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check check (
  entity_type is null or entity_type in (
    'customer', 'vehicle', 'reservation', 'inspection', 'damage',
    'maintenance', 'expense', 'document', 'invitation', 'membership',
    'contract',
    -- New for phase 48:
    'import_batch'
  )
);
