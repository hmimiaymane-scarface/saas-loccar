-- Phase 19 of the RentalOS build roadmap ("Security & Sensitive
-- Document Hardening Pass"), requirement 2: sensitive document
-- protection. Two real gaps found while auditing the current system:
--
--   1. Documents (identity documents, driving licences, passports —
--      the most sensitive data type in this app) had no access logging
--      at all, unlike contracts (contract_viewed/printed/downloaded,
--      phase 11). Fixed below by extending the activity_log type
--      taxonomy; the actual logging call happens in TypeScript
--      (app/(dashboard)/documents/actions.ts#logDocumentAccess), same
--      split as everywhere else in this event backbone.
--   2. Phase 17 seeded `download_documents` into role_permission_defaults
--      and lib/permissions/catalog.ts, but nothing ever actually called
--      has_permission(..., 'download_documents') anywhere — not RLS,
--      not a server action. The `documents` table's SELECT policy
--      (20260719090800_handoff_rls.sql) was untouched by phase 17's own
--      RLS rewrite and is still plain is_company_member(company_id),
--      meaning EVERY role — including cleaner/mechanic, who phase 17
--      deliberately kept out of customer/financial data everywhere else
--      — could read every customer's identity documents. This wires
--      the permission key up for real and closes that gap.

-- ---------------------------------------------------------------------
-- 1. activity_log: two new event types.
-- ---------------------------------------------------------------------
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
  'document_viewed', 'document_downloaded'
));

-- ---------------------------------------------------------------------
-- 2. download_documents: actually enforce it. Re-seed to match what is
-- true TODAY for every role except cleaner/mechanic (owner, manager,
-- agent, accountant, driver can all currently view documents via the
-- unrestricted is_company_member policy) — a deliberate, not-accidental
-- exception for cleaner/mechanic, consistent with phase 17's own
-- decision to keep those two roles out of customer/financial data
-- everywhere else. This is a real, intentional tightening for those two
-- roles, not a "preserve everything" migration — documents simply
-- wasn't in scope for phase 17's own RLS rewrite, so this gap was never
-- actually closed until now.
update public.role_permission_defaults
set allowed = true
where permission_key = 'download_documents'
  and role in ('agent', 'accountant', 'driver');

-- ---------------------------------------------------------------------
-- 3. documents SELECT: is_company_member(...) -> has_permission(...).
-- INSERT/UPDATE/DELETE are untouched — those already have their own
-- role gates (front-desk roles / owner-manager) from
-- 20260719090800_handoff_rls.sql and this phase isn't revisiting them.
-- ---------------------------------------------------------------------
drop policy "Members can view documents" on public.documents;
create policy "Permitted roles can view documents"
  on public.documents for select
  using (public.has_permission(company_id, 'download_documents'));
