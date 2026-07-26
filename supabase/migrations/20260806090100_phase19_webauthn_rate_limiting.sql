-- Phase 19 of the RentalOS build roadmap ("Security & Sensitive
-- Document Hardening Pass"), requirement 6: mobile/WebAuthn session
-- review. Confirmed no bypass exists (every path requires a fully
-- verified assertion before the Supabase-session bridge runs) — but
-- also confirmed NO rate-limiting on authenticate-verify: an attacker
-- who knows or guesses a credential_id/userHandle pair could retry
-- `verifyAuthenticationResponse` indefinitely with no cooldown, counter,
-- or lockout of any kind.
--
-- Same "extend the existing row, no new table" convention as
-- reservations.assigned_employee_id / maintenance_records.assigned_
-- employee_id — the credential row is already looked up once per
-- attempt in authenticate-verify/route.ts, so these two columns ride
-- along on that same query for free rather than needing a second table
-- and a second lookup.
alter table public.webauthn_credentials
  add column failed_attempts integer not null default 0,
  add column locked_until timestamptz;

-- register-verify is deliberately NOT given the same treatment — it
-- already requires an authenticated session (you're registering a
-- passkey for your own already-logged-in account), a fundamentally
-- lower-risk surface with no "guess whose credential this is" attack the
-- way an unauthenticated sign-in attempt has.
