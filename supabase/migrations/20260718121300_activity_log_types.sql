-- Two more activity types needed by the reservation workflow: a generic
-- status change (used when no more specific type fits — e.g. moving to
-- 'pending', 'cancelled', 'no_show') and a plain field edit.
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
  'member_invited'
));
