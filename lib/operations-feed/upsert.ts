import { createClient } from "@/lib/supabase/server"
import type { FeedItemDraft, ObserverType, FeedEntityType } from "@/lib/operations-feed/types"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface FeedItemKey {
  observerType: ObserverType
  entityType: FeedEntityType
  entityId: string
}

export type FeedItemAction = "opened" | "updated" | "left_dismissed" | "resolved" | "unchanged"

/**
 * Roadmap phase 34 ("Separate Real-Time Operations from Daily
 * Intelligence") — the single-item reconciliation rule
 * `runOperationsFeedForCompany`'s per-draft loop already used, extracted
 * so a real-time trigger (`lib/operations-feed/realtime.ts`) can reuse
 * the exact same rule for one entity instead of duplicating it. Two
 * paths that decide "open, update, leave dismissed alone, or resolve"
 * must never quietly diverge on what that means.
 *
 * `existing` is passed in rather than fetched here — the batch job
 * already has every existing row in memory from one bulk fetch (no
 * reason to add a query per draft); a real-time caller fetches just its
 * own one row first. Same rule, different cost profile per caller.
 */
export async function upsertOperationsFeedItem(
  supabase: SupabaseServerClient,
  companyId: string,
  key: FeedItemKey,
  draft: FeedItemDraft | null,
  existing: { id: string; status: string } | undefined,
  now: Date
): Promise<FeedItemAction> {
  if (draft) {
    if (!existing) {
      const { error } = await supabase.from("operations_feed_items").insert({
        company_id: companyId,
        observer_type: key.observerType,
        entity_type: key.entityType,
        entity_id: key.entityId,
        priority_tier: draft.priorityTier,
        observation: draft.observation,
        reasoning: draft.reasoning,
        suggested_action: draft.suggestedAction,
        action_label: draft.actionLabel,
        action_href: draft.actionHref,
        confidence: draft.confidence,
        status: "open",
      })
      if (error) throw error
      return "opened"
    }

    if (existing.status === "open") {
      const { error } = await supabase
        .from("operations_feed_items")
        .update({
          priority_tier: draft.priorityTier,
          observation: draft.observation,
          reasoning: draft.reasoning,
          suggested_action: draft.suggestedAction,
          action_label: draft.actionLabel,
          action_href: draft.actionHref,
          confidence: draft.confidence,
          last_seen_at: now.toISOString(),
        })
        .eq("id", existing.id)
      if (error) throw error
      return "updated"
    }

    // existing.status === "dismissed" — the human's call stands.
    return "left_dismissed"
  }

  // No draft: the condition no longer holds.
  if (existing && (existing.status === "open" || existing.status === "dismissed")) {
    const { error } = await supabase
      .from("operations_feed_items")
      .update({ status: "resolved", resolved_at: now.toISOString() })
      .eq("id", existing.id)
    if (error) throw error
    return "resolved"
  }

  return "unchanged"
}
