# Backup and Restore

Roadmap phase 67 (Launch Reliability Gate) — "backup/restore process
documented" is one of the 9 gate requirements. This is the runbook: what
Supabase already does automatically, what to verify/configure before
launch, and the exact steps to actually restore this app's data if it's
ever needed. Written to be followed by a human under stress (a real
data-loss incident), not just read once — every step names the exact
screen, table, or file involved.

## What Supabase already backs up automatically

Supabase's managed Postgres has its own backup system, entirely
separate from anything in this codebase — **verify the project's
actual plan tier before launch**, since the guarantee differs:

- **Free tier**: no automatic backups at all. Do not launch a real
  paying pilot on the free tier — upgrade first.
- **Pro tier and above**: daily backups, retained for a rolling window
  (7 days on Pro; longer on higher tiers). Point-in-time recovery
  (PITR, restore to any second within a retention window, not just a
  daily snapshot) is a separate paid add-on, not included by default.
- Check the actual current state at **Supabase Dashboard → Project
  Settings → Backups** before launch — this shows the real configured
  retention window and whether PITR is active for *this* project,
  which this doc can't assert on the codebase's behalf.

**What Supabase's Postgres backups do NOT cover**:

1. **Storage bucket contents** (`company-files` — every uploaded
   document, damage photo, contract PDF, company logo). Supabase
   Storage has its own separate durability model (it's backed by S3-
   compatible object storage, which is itself durable), but it is
   **not included in a Postgres point-in-time restore** — restoring
   the database to an earlier point does not undo or restore file
   changes in Storage. A `documents`/`media` row pointing at a
   `storage_path` that no longer exists (because a restore rolled the
   database back past when that row's file was uploaded, or a file was
   separately deleted) is a real, possible post-restore state to check
   for.
2. **`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   the project's own VAPID/AI provider keys** — these live in this
   app's deployment environment (Vercel or wherever it's hosted), not
   in Supabase's backup system at all. Losing the deployment
   environment itself (not just the database) means these need to be
   re-entered from wherever they were originally generated/saved (see
   `.env.example` for the full list and where each one comes from).
3. **This repository's own migration history** — Supabase's backup
   restores data, not "which of the 79 migrations under
   `supabase/migrations/` have been applied." A restore to a backup
   taken before a later migration ran will need that migration (and
   every one after it, in order) re-applied — see "Restoring into a
   fresh project" below for exactly this scenario.

## Before launch: what to actually configure

1. Confirm the live project's plan tier includes daily backups at
   minimum (Pro or above) — Free tier has none.
2. Decide whether PITR is worth the extra cost for this pilot. For a
   single early pilot, daily backups are probably sufficient; PITR
   matters more once real money and many companies' data are on the
   line.
3. Write down (outside this repo, somewhere the founder can reach
   during an actual incident) the project ref (`ooamtywsirpbsfmqsiix`
   for the project this app has been developed against — confirm this
   is still the real production project ref before launch, not a dev/
   staging one) and where the four secrets named above are stored.

## How to actually restore (existing project, using a Supabase backup)

1. Supabase Dashboard → the project → **Database → Backups**.
2. Pick the backup point (a specific daily snapshot, or a PITR
   timestamp if enabled) and follow Supabase's own restore flow. This
   is a Supabase-side operation — this codebase has no script or
   command that does this itself, deliberately: restoring a live
   production database is exactly the kind of action that should go
   through Supabase's own reviewed UI, not a one-off local script.
3. **After the restore completes**, before telling any customer the
   incident is over:
   - Check `supabase_migrations.schema_migrations` — confirm every
     migration this repo expects is present (compare its row count
     against `ls supabase/migrations/ | wc -l`, currently 79). If the
     restore point predates a migration, re-apply the missing ones in
     filename order (same one-off-script approach used to clear the
     original migration backlog — see this project's own memory of how
     that was done, no `psql`/Supabase CLI needed, a small Node script
     with the `pg` package works).
   - Spot-check that `documents`/`media` rows still resolve to real
     files in the `company-files` Storage bucket (see the Storage
     caveat above) — a restore can leave rows pointing at since-deleted
     files, or (less likely) files that were uploaded after the
     restore point with no matching row yet.
   - Re-run `scripts/phase6-tenant-isolation.ts` (self-cleaning, safe
     to run any time — see `docs/security.md`) as a real, live
     confirmation that RLS/tenant isolation still holds on the
     restored database before resuming normal operation.

## Restoring into a fresh project (total project loss)

If the Supabase project itself is gone (not just its data — the
project deleted, or unrecoverable):

1. Create a new Supabase project (`docs/supabase.md`'s "Create a
   Supabase project" section).
2. Apply all 79 migrations under `supabase/migrations/`, in filename
   order — `docs/supabase.md`'s "Run the migrations" section has the
   exact method already established for this environment (no
   `psql`/Supabase CLI available; a small Node script with the `pg`
   package, run once per migration file, in order).
3. Recreate the `company-files` Storage bucket with the same file-size
   limit and MIME-type allowlist `lib/storage.ts` expects (see
   `20260807090400_fix_storage_bucket_limits.sql` for the exact
   values this app was built against) — actual file contents can only
   be restored from whatever off-platform copy exists (see the Storage
   caveat above; this app has never had one, so this is a real,
   accepted gap, not a solved problem).
4. Update the deployment environment's `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to the
   new project's values.
5. Every company would need to go through onboarding again (no company/
   customer/vehicle data survives a total project loss with no
   Postgres backup to restore from) — this is the honest worst case,
   not a scenario this doc can paper over with a script that doesn't
   exist.

## Known, accepted gap

**There is no off-platform (outside Supabase) backup of Storage bucket
contents.** If Supabase's own object storage were to lose data (rather
than this app's database), there is currently no independent copy to
restore from. This mirrors the exact "known limitation, not a solved
problem" honesty this project's other docs already use for gaps of
this size (see `docs/security.md`'s own "known limitations" sections)
— worth a dedicated future phase if the business grows enough that this
risk needs closing (e.g. a scheduled export of the bucket to a second
object-storage provider), not something this phase invents a partial
fix for.
