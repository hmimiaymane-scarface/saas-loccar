-- More activity types for the owner-operating-system phase: maintenance
-- lifecycle events distinct from the generic 'vehicle_status_changed',
-- expense recording, and the new lightweight team-access lifecycle
-- (member_invited already existed but was never actually triggered until
-- this phase's invite_member()).
alter table public.activity_log drop constraint activity_log_type_check;
alter table public.activity_log add constraint activity_log_type_check check (type in (
  'reservation_requested',
  'reservation_confirmed',
  'reservation_status_changed',
  'reservation_updated',
  'payment_recorded',
  'vehicle_picked_up',
  'vehicle_returned',
  'vehicle_status_changed',
  'maintenance_completed',
  'customer_created',
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
  'invitation_accepted'
));
