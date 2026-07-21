import { createClient } from "@/lib/supabase/server"
import type { PriorityTier, ObserverType, FeedEntityType, FeedConfidence } from "@/lib/operations-feed/types"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface OperationsFeedItem {
  id: string
  observerType: ObserverType
  entityType: FeedEntityType
  entityId: string
  priorityTier: PriorityTier
  observation: string
  reasoning: string
  suggestedAction: string
  actionLabel: string
  actionHref: string
  confidence: FeedConfidence
  firstDetectedAt: string
  lastSeenAt: string
}

const PRIORITY_ORDER: Record<PriorityTier, number> = { critical: 0, operational: 1, business_health: 2, informational: 3 }

function mapRow(row: {
  id: string
  observer_type: string
  entity_type: string
  entity_id: string
  priority_tier: string
  observation: string
  reasoning: string
  suggested_action: string
  action_label: string
  action_href: string
  confidence: string
  first_detected_at: string
  last_seen_at: string
}): OperationsFeedItem {
  return {
    id: row.id,
    observerType: row.observer_type as ObserverType,
    entityType: row.entity_type as FeedEntityType,
    entityId: row.entity_id,
    priorityTier: row.priority_tier as PriorityTier,
    observation: row.observation,
    reasoning: row.reasoning,
    suggestedAction: row.suggested_action,
    actionLabel: row.action_label,
    actionHref: row.action_href,
    confidence: row.confidence as FeedConfidence,
    firstDetectedAt: row.first_detected_at,
    lastSeenAt: row.last_seen_at,
  }
}

/** Every `open` feed item for a company, sorted the way requirement 4
 * demands: priority tier first (critical items always first,
 * regardless of how recently they were detected), most recently
 * detected within a tier second. Shared by this phase's temporary
 * `/operations-feed` page and phase 13's Command Center placement —
 * one read function, two homes. */
export async function getOpenOperationsFeedItems(supabase: SupabaseServerClient, companyId: string, limit?: number): Promise<OperationsFeedItem[]> {
  let query = supabase.from("operations_feed_items").select("*").eq("company_id", companyId).eq("status", "open").order("last_seen_at", { ascending: false })
  if (limit) query = query.limit(limit)

  const { data, error } = await query
  if (error) throw error

  const items = (data ?? []).map((row) => mapRow(row as never))
  return items.sort((a, b) => PRIORITY_ORDER[a.priorityTier] - PRIORITY_ORDER[b.priorityTier])
}
