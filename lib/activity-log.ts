import { createClient } from "@/lib/supabase/server"
import type { ActivityType } from "@/types/rental"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Best-effort activity write, used by server actions right after a
 * mutation succeeds. Deliberately a separate statement rather than bundled
 * into the same transaction as the mutation — see docs/supabase.md for the
 * tradeoff this accepts (a mutation can succeed with no log entry if this
 * insert fails, which is preferable to risking the reverse).
 */
export async function logActivity(
  supabase: SupabaseServerClient,
  companyId: string,
  actorId: string,
  type: ActivityType,
  title: string,
  description?: string | null,
  metadata?: Record<string, unknown>
) {
  await supabase.from("activity_log").insert({
    company_id: companyId,
    actor_id: actorId,
    type,
    title,
    description: description ?? null,
    metadata: metadata ?? null,
  })
}
