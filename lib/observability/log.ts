"use server"

import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import type { OperationalEventSeverity, OperationalEventSource } from "@/lib/observability/types"

interface LogOperationalEventInput {
  source: OperationalEventSource
  severity?: OperationalEventSeverity
  context?: string | null
  message: string
  metadata?: Record<string, unknown>
  durationMs?: number | null
}

/**
 * Records one system-health event (see the operational_events migration
 * and lib/observability/log-admin.ts's counterpart for the no-session
 * write path). Client components call this directly, unawaited — same
 * fire-and-forget contract as lib/analytics/track.ts's trackUsageEvent:
 * never throws, mock mode short-circuits before touching Supabase,
 * identity comes from the caller's own session (never passed in).
 *
 * This is the session-derived, RLS-gated write path — it requires a
 * signed-in company member (operational_events' own insert policy is
 * `is_company_member(company_id)`, and company_id is never null here).
 * A route or job with no session at all (the two Vercel Cron jobs) must
 * use logOperationalEventAsAdmin instead — see that file for why this
 * one can't just be extended to cover them.
 */
export async function logOperationalEvent(input: LogOperationalEventInput): Promise<void> {
  if (!isSupabaseConfigured) return

  try {
    const session = await getSessionContext()
    if (!session) return

    const supabase = await createClient()
    const { error } = await supabase.from("operational_events").insert({
      company_id: session.company.id,
      source: input.source,
      severity: input.severity ?? "error",
      context: input.context ?? null,
      message: input.message,
      metadata: input.metadata ?? {},
      duration_ms: input.durationMs ?? null,
    })
    if (error) console.error("logOperationalEvent insert failed:", error.message)
  } catch (err) {
    console.error("logOperationalEvent failed:", err)
  }
}
