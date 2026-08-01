import { createAdminClient } from "@/lib/supabase/admin"
import type { OperationalEventSeverity, OperationalEventSource } from "@/lib/observability/types"

interface LogOperationalEventAsAdminInput {
  companyId: string | null
  source: OperationalEventSource
  severity?: OperationalEventSeverity
  context?: string | null
  message: string
  metadata?: Record<string, unknown>
  durationMs?: number | null
}

/**
 * The no-session counterpart to lib/observability/log.ts's
 * logOperationalEvent — for the two places in this app that run with
 * no signed-in user at all (Vercel Cron making a bare HTTP request).
 * Uses the service-role admin client, so it bypasses operational_events'
 * RLS insert policy entirely rather than needing one.
 *
 * Same two rules as lib/supabase/admin.ts itself, because this is
 * exactly the kind of call that client documents as the sanctioned
 * exception: import this ONLY from `app/api/cron/*` route handlers (or
 * a module they call directly), never from a page, a client component,
 * or a normal server action reachable by an ordinary signed-in
 * request — those must call logOperationalEvent instead. And every
 * call must pass an explicit companyId the caller already determined
 * itself (e.g. from the company being iterated), never a implicit one.
 */
export async function logOperationalEventAsAdmin(input: LogOperationalEventAsAdminInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("operational_events").insert({
      company_id: input.companyId,
      source: input.source,
      severity: input.severity ?? "error",
      context: input.context ?? null,
      message: input.message,
      metadata: input.metadata ?? {},
      duration_ms: input.durationMs ?? null,
    })
    if (error) console.error("logOperationalEventAsAdmin insert failed:", error.message)
  } catch (err) {
    console.error("logOperationalEventAsAdmin failed:", err)
  }
}
