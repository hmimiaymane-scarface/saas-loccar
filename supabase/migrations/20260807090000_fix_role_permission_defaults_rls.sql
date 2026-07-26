-- Found applying every migration to a real Supabase project for the
-- first time (productization wave 1 phase 5): `role_permission_defaults`
-- was the only public table left without RLS enabled. Supabase grants
-- full table privileges (including INSERT/UPDATE/DELETE/TRUNCATE) to
-- anon/authenticated by default on every table — RLS is what's meant
-- to be the actual gate (see docs/security.md's "RLS is the only thing
-- that enforces isolation"). This table has no `company_id` (role
-- defaults are identical for every company — nothing to isolate
-- per-tenant), which is presumably why it was skipped when phase 17
-- enabled RLS everywhere else — but "nothing to isolate" only
-- justifies open reads, not open writes. Without this fix, any anon or
-- authenticated caller could rewrite or wipe the entire permission
-- engine's role defaults directly via the REST API.
alter table public.role_permission_defaults enable row level security;

create policy "Anyone can read role permission defaults"
  on public.role_permission_defaults for select
  using (true);

-- Deliberately no insert/update/delete policy — these are static,
-- hand-maintained seed rows (same "closed, hand-maintained list"
-- convention as lib/permissions/catalog.ts). The only intended write
-- path is a manual migration, never the app or any authenticated user.
