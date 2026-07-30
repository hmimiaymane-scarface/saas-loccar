-- Roadmap phase 44 (Push Notifications, wave 6 "Communication and
-- Retention"). Three additions:
--
-- 1. push_subscriptions — one row per browser/device a user has
-- enabled push on (the Web Push API's PushSubscription object: an
-- endpoint URL plus two keys). Same per-user, no-company-wide-visibility
-- shape as webauthn_credentials (20260803090000) — a device's push
-- subscription is exactly as personal as a passkey.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index push_subscriptions_company_idx on public.push_subscriptions (company_id);

alter table public.push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
  on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2. push_notification_log — dedupe bookkeeping for the reminder cron
-- (lib/notifications/reminders.ts), deliberately NOT the same
-- mechanism as notifications.key (20260720090400's dismissal-marker
-- unique index). That index means "the user has dismissed this live
-- alert"; this one means "we already pushed this specific occurrence
-- to this user" — two different concerns that would produce wrong
-- behavior if conflated (a dismissed-but-not-yet-pushed alert would
-- never push; a pushed-but-not-dismissed alert would vanish from the
-- dashboard). No RLS needed for user-facing reads — only ever written
-- by the service-role cron (see lib/supabase/admin.ts), same as
-- operations_feed_items.
create table public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- e.g. 'rental_overdue:<reservation_id>', 'pickup_approaching:<reservation_id>'
  dedupe_key text not null,
  sent_at timestamptz not null default now()
);

create unique index push_notification_log_user_dedupe_idx
  on public.push_notification_log (user_id, dedupe_key);

alter table public.push_notification_log enable row level security;

-- ---------------------------------------------------------------------
-- 3. Two new notification types this phase's priority list needs that
-- didn't exist at all (lib/notifications channel-agnostic service,
-- phase 18, already anticipated a "push" channel id but no code
-- generated these two conditions in any form before this phase).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
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
  'vehicle_unavailable_upcoming_reservation',
  'approval_requested',
  'approval_approved',
  'approval_rejected',
  -- New for phase 44:
  'booking_request_received',
  'identity_document_missing'
));
