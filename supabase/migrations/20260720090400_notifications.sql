-- Most items in the phase brief's notification list ("pickup approaching",
-- "maintenance overdue", "licence expiring", ...) are current-state facts
-- that can be recomputed from live data on every request — they don't
-- need a permanent row, and a permanent row would just be a second,
-- easily-stale copy of the truth. This table exists for exactly two
-- things instead:
--
--   1. Genuine one-off events with no ongoing "state" to re-derive
--      (e.g. a damage was just recorded — see `type` below).
--   2. A per-user "I've seen this" marker for a *live* alert, addressed
--      by a stable `key` (e.g. 'rental_overdue:<reservation_id>'). The
--      marker's mere existence hides that specific live alert for that
--      user; when the underlying condition changes (paid, returned,
--      resolved), the key stops being generated and the alert vanishes
--      on its own — the marker becomes inert, never a stale duplicate.
--
-- Every row is per-user (never company-wide) so "mark as read" for one
-- person never hides something a colleague hasn't seen yet.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'pickup_approaching',
    'return_approaching',
    'rental_overdue',
    'outstanding_balance',
    'deposit_unresolved',
    'maintenance_due',
    'maintenance_overdue',
    'vehicle_document_expiring',
    'licence_expiring',
    'damage_recorded',
    'inspection_draft_unfinished',
    'vehicle_unavailable_upcoming_reservation'
  )),
  -- Present only on a live-alert dismissal marker; null for a genuine
  -- one-off event row.
  key text,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  link_href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- One dismissal marker per user per live-alert key — inserting the same
-- dismissal twice is a no-op, not a duplicate row.
create unique index notifications_dismissal_key on public.notifications (user_id, key) where key is not null;

create index notifications_user_unread_idx on public.notifications (user_id, read_at) where read_at is null;
create index notifications_company_id_idx on public.notifications (company_id);
