-- Roadmap phase 16 ("Mobile Field Experience Foundation") — schema
-- groundwork for four independent pieces of that phase. Written but,
-- per this project's standing rule, NOT applied to the live Supabase
-- project from this session.

-- ---------------------------------------------------------------------
-- 1. Task assignment — "today's work for ME" (requirement 2, mission
-- feed) is not derivable from anything that existed before this phase.
-- Nullable, on delete set null: an unassigned reservation stays visible
-- to every agent exactly as it does today — assigning is an owner/
-- manager convenience, never a restriction on who CAN work a job.
-- Mirrors reservations.created_by's existing FK style exactly.
-- ---------------------------------------------------------------------
alter table public.reservations
  add column assigned_employee_id uuid references auth.users (id) on delete set null;

create index reservations_assigned_employee_idx on public.reservations (company_id, assigned_employee_id)
  where assigned_employee_id is not null;

-- ---------------------------------------------------------------------
-- 2. WebAuthn / passkey credentials (requirement 8). Supabase Auth has
-- no first-class WebAuthn support — this table is the credential store
-- a hand-rolled registration/authentication ceremony
-- (@simplewebauthn/server) reads and writes; a verified assertion is
-- then bridged into a real Supabase session server-side (see
-- docs/mobile.md for why, and lib/supabase/admin.ts for the
-- service-role client that bridge uses — the same narrow, documented
-- exception phase 12's cron job already established).
-- ---------------------------------------------------------------------
create table public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Base64url-encoded credential ID from the authenticator — what the
  -- browser sends back on every subsequent sign-in attempt to say
  -- "here's who I claim to be," verified against the stored public key.
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index webauthn_credentials_user_idx on public.webauthn_credentials (user_id);

alter table public.webauthn_credentials enable row level security;

-- A user manages only their own passkeys — no company-wide visibility
-- needed or wanted for a personal biometric credential.
create policy "Users manage their own webauthn credentials"
  on public.webauthn_credentials
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Idempotency keys (requirement 6, offline queueing). A replayed
-- mutation from the offline sync engine — e.g. a response was lost
-- after the insert actually succeeded — must be a safe no-op, not a
-- duplicate row. Nullable + unique per company: every pre-phase-16
-- caller omits this and behaves exactly as before; the offline sync
-- engine is the only caller that ever sets it, using a client-
-- generated uuid it already tracks in its own local queue.
-- ---------------------------------------------------------------------
alter table public.media add column idempotency_key uuid;
alter table public.documents add column idempotency_key uuid;
alter table public.damages add column idempotency_key uuid;

create unique index media_company_idempotency_idx on public.media (company_id, idempotency_key)
  where idempotency_key is not null;
create unique index documents_company_idempotency_idx on public.documents (company_id, idempotency_key)
  where idempotency_key is not null;
create unique index damages_company_idempotency_idx on public.damages (company_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------
-- 4. Drawn signature capture (requirement 6's "signature capture"
-- workflow). contract_signatures.method's own migration comment
-- (20260731090000_contract_lifecycle.sql) already anticipated this:
-- "a real drawn-signature capture can be added later without a schema
-- change" — this is that addition. signature_image_path is nullable
-- and only ever set alongside method = 'drawn_signature'; the existing
-- typed_name_confirmation path is completely unaffected.
-- ---------------------------------------------------------------------
alter table public.contract_signatures
  drop constraint contract_signatures_method_check,
  add constraint contract_signatures_method_check
    check (method in ('typed_name_confirmation', 'drawn_signature')),
  add column signature_image_path text;
