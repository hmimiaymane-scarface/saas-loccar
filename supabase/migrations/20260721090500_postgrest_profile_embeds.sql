-- Fixes a real bug caught against a live project: several lib/data.ts
-- queries use PostgREST's automatic embedding syntax to pull a display
-- name alongside an activity/membership row, e.g.
-- `.select("..., actor:profiles(full_name)")`. That syntax requires an
-- actual foreign key PostgREST can see between the two tables being
-- joined — but activity_log.actor_id and company_memberships.user_id
-- both reference auth.users, never public.profiles directly, so
-- PostgREST had no relationship to embed on and every one of these
-- queries failed at runtime with PGRST200 ("Could not find a
-- relationship... in the schema cache"). This never surfaced against
-- mock data or in code review because it only manifests against a real
-- PostgREST-backed Supabase project.
--
-- The fix: add a second foreign key on each column pointing at
-- public.profiles(id) as well. This is safe — profiles.id is always
-- exactly auth.users.id for every real user (profiles rows are created
-- automatically by the handle_new_user() trigger on signup, and never
-- deleted independently of the auth.users row), so every existing
-- actor_id/user_id value already satisfies this constraint. Postgres
-- allows a column to carry more than one foreign key to different
-- tables as long as all values satisfy all of them, which they do here.
-- The original auth.users foreign keys are left in place unchanged.

alter table public.activity_log
  add constraint activity_log_actor_id_profiles_fkey
  foreign key (actor_id) references public.profiles (id) on delete set null;

alter table public.company_memberships
  add constraint company_memberships_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
