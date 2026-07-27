-- Found via productization wave 1 phase 7's real-pipeline validation
-- pass: actually calling grant_permission_override() against the live
-- project (something no prior phase had done for real) failed outright
-- with "new row for relation activity_log violates check constraint
-- activity_log_type_check". Root cause: phase 17's own migration
-- (20260804090100_phase17_permission_engine.sql) inserts activity_log
-- rows with type 'permission_override_granted'/'permission_override_revoked'
-- from inside grant_permission_override()/revoke_permission_override(),
-- but never widened activity_log_type_check to allow them — an
-- omission baked in from the start, not something a later migration
-- broke. Since the activity_log insert and the employee_permission_overrides
-- write happen in the same plpgsql function body, the constraint
-- violation rolled back the ENTIRE call, meaning every attempt to grant
-- or revoke a permission override — including every Staff access
-- switch flip from productization wave 1 phase 3 — has silently failed
-- against this real project since phase 5 applied the migration.
alter table public.activity_log drop constraint activity_log_type_check;
alter table public.activity_log add constraint activity_log_type_check check (type in (
  'reservation_requested', 'reservation_confirmed', 'reservation_status_changed', 'reservation_updated',
  'reservation_cancelled', 'payment_recorded', 'payment_refunded', 'vehicle_picked_up', 'vehicle_returned',
  'vehicle_status_changed', 'maintenance_completed', 'customer_created', 'customer_updated',
  'document_uploaded', 'member_invited', 'pickup_started', 'return_started', 'inspection_completed',
  'inspection_corrected', 'damage_recorded', 'damage_resolved', 'deposit_collected', 'deposit_returned',
  'deposit_retained', 'maintenance_scheduled', 'vehicle_entered_maintenance', 'maintenance_cancelled',
  'expense_recorded', 'user_suspended', 'user_reactivated', 'user_removed', 'invitation_accepted',
  'rental_extended', 'contract_generated', 'contract_signed', 'contract_prepared',
  'contract_sent_for_signature', 'contract_activated', 'contract_completed', 'contract_archived',
  'contract_cancelled', 'contract_amended', 'contract_viewed', 'contract_printed', 'contract_downloaded',
  'template_created', 'template_version_activated',
  'document_viewed', 'document_downloaded',
  'permission_override_granted', 'permission_override_revoked'
));
