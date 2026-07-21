import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { env } from "@/lib/env"
import type { Database } from "@/types/database"

/**
 * The service-role Supabase client — bypasses Row Level Security
 * entirely. Every other client in this codebase
 * (`lib/supabase/server.ts`, `lib/supabase/client.ts`) uses the public
 * anon key and relies on RLS plus the caller's own auth cookies for
 * access control; this is the one deliberate exception, and it exists
 * for exactly one reason: `app/api/cron/operations-feed/route.ts`
 * has no signed-in user at all (Vercel Cron makes a bare HTTP request,
 * no session cookies), yet needs to read across every tenant to run
 * observers and write `operations_feed_items` rows for each of them.
 *
 * This is the same trade-off Supabase's own docs describe for
 * "trusted server environments" (cron jobs, queue workers) — never a
 * general-purpose escape hatch. Two rules, enforced by convention
 * since there's no way to enforce them at the type level:
 *   1. Import this ONLY from `app/api/cron/*` route handlers (or a
 *      module they call directly, like `lib/operations-feed/run.ts`),
 *      or from `app/api/webauthn/authenticate-verify/route.ts`
 *      (roadmap phase 16) — the one other place in this app that, by
 *      definition, has no signed-in session yet: a passkey sign-in
 *      ceremony has to look up which user a credential belongs to and
 *      mint their session, before any auth cookie exists to scope a
 *      normal RLS-backed client. Never from a page, a client
 *      component, or a normal server action reachable by an ordinary
 *      signed-in request.
 *   2. Every write this client makes must be scoped by an explicit
 *      `company_id` the calling code determined itself (e.g. by
 *      iterating `companies` one row at a time, or — for WebAuthn —
 *      the `company_id` stored on the credential row itself) — RLS
 *      isn't there to catch a missing `.eq("company_id", ...)`
 *      anymore.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` was already reserved in .env.example
 * before this phase (for a seed script that was never actually
 * built) — this is the key's first real runtime use.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!env.supabaseUrl || !serviceRoleKey) {
    throw new Error("Admin Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
  }
  return createSupabaseClient<Database>(env.supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
