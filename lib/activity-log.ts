import { createClient } from "@/lib/supabase/server"
import type { ActivityType, EntityType } from "@/types/rental"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface RecordEventInput {
  companyId: string
  /** Null only for actorType 'system' | 'ai' — a human actor must always
   * pass their user id. */
  actorId: string | null
  type: ActivityType
  entityType: EntityType
  entityId: string
  title: string
  description?: string | null
  /** A loose bag of related ids/values, same convention as before this
   * phase — e.g. `{ reservation_id }`. For update-type events, include
   * `before`/`after` keys to capture what changed. */
  metadata?: Record<string, unknown>
  /** Defaults to 'user' — set 'system' or 'ai' for events emitted by a
   * background job or the AI layer (see roadmap phase 12), not a human
   * request. */
  actorType?: "user" | "system" | "ai"
  /** Defaults to 'web'. */
  source?: "web" | "mobile" | "api" | "background_job"
}

/**
 * Best-effort event write, used by server actions right after a
 * mutation succeeds. Deliberately a separate statement rather than bundled
 * into the same transaction as the mutation — see docs/supabase.md for the
 * tradeoff this accepts (a mutation can succeed with no log entry if this
 * insert fails, which is preferable to risking the reverse).
 *
 * This is the TS-side half of the event backbone; the SQL-side
 * equivalent is public.log_activity(), called from the SECURITY DEFINER
 * RPC functions that can't call back into TS (see
 * supabase/migrations/20260723090000_event_backbone.sql). Both write to
 * the same activity_log table with the same shape.
 */
export async function recordEvent(supabase: SupabaseServerClient, input: RecordEventInput) {
  await supabase.from("activity_log").insert({
    company_id: input.companyId,
    actor_id: input.actorId,
    actor_type: input.actorType ?? "user",
    type: input.type,
    entity_type: input.entityType,
    entity_id: input.entityId,
    title: input.title,
    description: input.description ?? null,
    metadata: input.metadata ?? null,
    source: input.source ?? "web",
  })
}

export interface EventQueryOptions {
  limit?: number
}

/** All events about one specific entity (e.g. every event for a given
 * reservation or damage), most recent first — this is the plumbing
 * roadmap phases 07 (vehicle timeline) and 09 (customer timeline) build
 * on. Plumbing only: no UI here. */
export async function getEventsForEntity(
  supabase: SupabaseServerClient,
  companyId: string,
  entityType: EntityType,
  entityId: string,
  opts: EventQueryOptions = {}
) {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, type, entity_type, entity_id, title, description, metadata, actor_id, actor_type, source, created_at")
    .eq("company_id", companyId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50)

  if (error) throw error
  return data ?? []
}

/** All events of the given type(s) for a tenant, optionally since a
 * given ISO timestamp — the shape roadmap phase 12's Operations Feed
 * observers will query (e.g. "any damage_recorded events in the last 30
 * days"). Plumbing only: no UI here. */
export async function getEventsByType(
  supabase: SupabaseServerClient,
  companyId: string,
  types: ActivityType[],
  sinceIso?: string,
  opts: EventQueryOptions = {}
) {
  let query = supabase
    .from("activity_log")
    .select("id, type, entity_type, entity_id, title, description, metadata, actor_id, actor_type, source, created_at")
    .eq("company_id", companyId)
    .in("type", types)

  if (sinceIso) query = query.gte("created_at", sinceIso)

  const { data, error } = await query.order("created_at", { ascending: false }).limit(opts.limit ?? 200)

  if (error) throw error
  return data ?? []
}

/** Pure helper (no Supabase dependency, unit-testable): an ISO timestamp
 * `days` ago from now, for the common "events in the last N days" query
 * shape used by getEventsByType callers. */
export function daysAgoIso(days: number, from: Date = new Date()): string {
  const result = new Date(from)
  result.setDate(result.getDate() - days)
  return result.toISOString()
}
