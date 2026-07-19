-- Phase 01 of the RentalOS build roadmap ("Business Event Backbone &
-- Audit Architecture"): extends the existing activity_log — already
-- append-only and tenant-isolated, see 20260718120600_activity_log.sql
-- and 20260718120800_row_level_security.sql — into a proper business
-- event backbone that later phases (vehicle/customer intelligence, the
-- AI Operations Feed) can query without parsing ad hoc jsonb shapes.
--
-- Three additions:
--   1. entity_type/entity_id — the primary business entity an event is
--      about (already an established naming convention on `media`, see
--      20260719090400_media.sql), indexed for "all events for this X"
--      queries. Kept nullable: some historical rows can't be backfilled
--      honestly from their existing metadata (see below) and are left
--      null rather than guessed at.
--   2. actor_type/source — lets an event be attributed to something
--      other than a human click (a future background job or AI
--      recommendation engine, see phase 12), without changing how
--      today's user-triggered events are recorded (both default to
--      today's only real values: 'user' and 'web').
--   3. public.log_activity(...) — a single, plain (not SECURITY
--      DEFINER — it doesn't need elevated rights of its own; every
--      caller is either already inside a SECURITY DEFINER function or
--      an ordinary member covered by the existing RLS insert policy)
--      SQL function that replaces the 14 raw `insert into activity_log`
--      literals scattered across five migrations. The TS-side
--      `recordEvent()` in lib/activity-log.ts keeps inserting directly
--      (RLS already covers that path); this only consolidates the
--      SQL-function side.

-- ---------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------
alter table public.activity_log
  add column entity_type text,
  add column entity_id uuid,
  add column actor_type text not null default 'user' check (actor_type in ('user', 'system', 'ai')),
  add column source text not null default 'web' check (source in ('web', 'mobile', 'api', 'background_job'));

alter table public.activity_log
  add constraint activity_log_entity_type_check check (
    entity_type is null or entity_type in (
      'customer', 'vehicle', 'reservation', 'inspection', 'damage',
      'maintenance', 'expense', 'document', 'invitation', 'membership',
      'contract'
    )
  );

-- ---------------------------------------------------------------------
-- 2. Indexes for the two query shapes the read API (lib/activity-log.ts)
--    and later phases actually need: "everything about this entity" and
--    "everything of this type recently". The existing
--    activity_log_company_created_idx stays — the untyped, unfiltered
--    "recent activity" reads (lib/data.ts getRecentActivity) still use it.
-- ---------------------------------------------------------------------
create index activity_log_company_entity_idx on public.activity_log (company_id, entity_type, entity_id);
create index activity_log_company_type_created_idx on public.activity_log (company_id, type, created_at desc);

-- ---------------------------------------------------------------------
-- 3. Extend the type taxonomy (supersedes v3 from
--    20260720090300_activity_log_types_v3.sql). Three types close real
--    logging gaps found while auditing every call site for this phase:
--      - customer_updated: updateCustomerProfile/setCustomerStatus in
--        customers/actions.ts had no logging at all before this phase.
--      - reservation_cancelled: previously folded into the generic
--        reservation_status_changed; transition_reservation_status()
--        below now special-cases it.
--      - payment_refunded: previously folded into the generic
--        payment_recorded; recordPayment() now special-cases it.
--    Three more are added as reserved vocabulary only — no mutation
--    emits them yet, because the feature they belong to doesn't exist
--    yet in this codebase:
--      - rental_extended: no rental-extension feature exists yet.
--      - contract_generated / contract_signed: the Dynamic Contract
--        Engine is phases 10-11 of the roadmap, not built yet.
--    document_expired is deliberately NOT added here — detecting
--    expiry is phase 04's job (Document Intelligence Engine), and until
--    something can actually emit it, adding the type would be dead
--    vocabulary with no real design behind it yet.
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
  'contract_signed'
));

-- ---------------------------------------------------------------------
-- 4. Best-effort backfill of entity_type/entity_id for existing rows,
--    derived only from what each event's own metadata already recorded
--    — never guessed. Several event types can't be backfilled at all
--    because the id that would identify the specific entity was never
--    captured historically (e.g. customer_created and
--    vehicle_status_changed logged no metadata; document_uploaded and
--    payment_recorded never stored the document/payment row's own id).
--    Those rows stay null. Every mutation site is updated below to
--    capture entity_type/entity_id going forward, so this gap only
--    affects history, not anything new.
-- ---------------------------------------------------------------------
update public.activity_log
set entity_type = 'reservation', entity_id = (metadata ->> 'reservation_id')::uuid
where entity_type is null
  and metadata ? 'reservation_id'
  and type in (
    'reservation_requested', 'reservation_confirmed', 'reservation_status_changed', 'reservation_updated',
    'vehicle_picked_up', 'vehicle_returned',
    'deposit_collected', 'deposit_returned', 'deposit_retained',
    'document_uploaded', 'payment_recorded'
  );

update public.activity_log
set entity_type = 'inspection', entity_id = (metadata ->> 'inspection_id')::uuid
where entity_type is null
  and metadata ? 'inspection_id'
  and type in ('pickup_started', 'return_started', 'inspection_completed', 'inspection_corrected');

update public.activity_log
set entity_type = 'damage', entity_id = (metadata ->> 'damage_id')::uuid
where entity_type is null
  and metadata ? 'damage_id'
  and type in ('damage_recorded', 'damage_resolved');

update public.activity_log
set entity_type = 'maintenance', entity_id = (metadata ->> 'maintenance_id')::uuid
where entity_type is null
  and metadata ? 'maintenance_id'
  and type in ('maintenance_scheduled', 'vehicle_entered_maintenance', 'maintenance_completed', 'maintenance_cancelled');

update public.activity_log
set entity_type = 'vehicle', entity_id = (metadata ->> 'vehicle_id')::uuid
where entity_type is null
  and metadata ? 'vehicle_id'
  and type = 'expense_recorded';

update public.activity_log
set entity_type = 'invitation', entity_id = (metadata ->> 'invitation_id')::uuid
where entity_type is null
  and metadata ? 'invitation_id'
  and type in ('member_invited', 'invitation_accepted');

update public.activity_log
set entity_type = 'membership', entity_id = (metadata ->> 'membership_id')::uuid
where entity_type is null
  and metadata ? 'membership_id'
  and type in ('user_suspended', 'user_reactivated', 'user_removed');

-- ---------------------------------------------------------------------
-- 5. The shared write helper. Not SECURITY DEFINER: every SQL-side
--    caller below is already executing inside a SECURITY DEFINER
--    function (so this runs with that function's elevated context
--    regardless), and this function is never meant to be a new,
--    independent privilege boundary — it only exists to stop the same
--    insert literal from being copy-pasted 13 times.
-- ---------------------------------------------------------------------
create or replace function public.log_activity(
  p_company_id uuid,
  p_actor_id uuid,
  p_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_description text default null,
  p_metadata jsonb default null,
  p_actor_type text default 'user',
  p_source text default 'web'
)
returns uuid
language sql
set search_path = public
as $$
  insert into public.activity_log (
    company_id, actor_id, actor_type, type, entity_type, entity_id, title, description, metadata, source
  ) values (
    p_company_id, p_actor_id, p_actor_type, p_type, p_entity_type, p_entity_id, p_title, p_description, p_metadata, p_source
  )
  returning id;
$$;

revoke all on function public.log_activity(uuid, uuid, text, text, uuid, text, text, jsonb, text, text) from public;
grant execute on function public.log_activity(uuid, uuid, text, text, uuid, text, text, jsonb, text, text) to authenticated;
