"use server"

import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import type { UsageEventType } from "@/lib/analytics/events"

interface TrackUsageEventInput {
  sessionId?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Records one usage-telemetry event (see lib/analytics/events.ts and
 * the usage_events migration for what this is and isn't for). Client
 * components call this directly, unawaited/fire-and-forget — it never
 * throws, so a failed or slow insert can't block or break the UI action
 * it's attached to. Identity (company/user) is derived server-side from
 * the caller's own session, same as every other server action in this
 * app — callers never pass companyId/userId themselves.
 *
 * Mock mode short-circuits before ever touching Supabase, same as every
 * mutating action in this app — usage telemetry can't be exercised live
 * without a real project, only its call sites can be reviewed.
 */
export async function trackUsageEvent(type: UsageEventType, input: TrackUsageEventInput = {}): Promise<void> {
  if (!isSupabaseConfigured) return

  try {
    const session = await getSessionContext()
    if (!session) return

    const supabase = await createClient()
    await supabase.from("usage_events").insert({
      company_id: session.company.id,
      user_id: session.userId,
      event_type: type,
      session_id: input.sessionId ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? {},
    })
  } catch (err) {
    console.error("trackUsageEvent failed:", err)
  }
}
