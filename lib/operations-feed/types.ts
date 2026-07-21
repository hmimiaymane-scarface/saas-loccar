/**
 * Roadmap phase 12 — the AI Operations Feed Engine. Shared types for
 * every observer (`lib/operations-feed/observers.ts`) and the
 * orchestrator that runs them (`lib/operations-feed/run.ts`).
 */

export type ObserverType =
  | "idle_vehicle"
  | "expiring_document"
  | "overlapping_reservations"
  | "unusual_pricing"
  | "inactive_high_value_customer"
  | "vehicle_health_decline"
  | "stale_inspection"
  | "missing_handoff_photos"

export type FeedEntityType = "vehicle" | "customer" | "reservation" | "document" | "inspection"

/**
 * Bible Chapter 10 §2's four-level hierarchy, narrowed to what a
 * single feed item can be: `critical` (needs immediate action),
 * `operational` (today's operations — someone should act today, not
 * urgently but not "someday" either), `business_health` (an
 * opportunity or a slow-building concern), `informational` (worth
 * knowing, nothing to do right now). Historical Analysis (the
 * hierarchy's 5th level) isn't a feed-item concept at all — it's
 * aggregate reporting, out of scope for a per-item priority.
 */
export type PriorityTier = "critical" | "operational" | "business_health" | "informational"

export type FeedConfidence = "high" | "medium" | "low"

/**
 * What one observer produces for one detected condition — everything
 * `operations_feed_items` needs, before the orchestrator adds
 * company-scoping and reconciles it against what's already stored.
 * Deliberately requires every field (bible's repeated structure:
 * observation + reasoning + suggested action + confidence +
 * one-click action) — a feed item that's missing any of these isn't
 * a valid feed item, per requirement 3.
 */
export interface FeedItemDraft {
  observerType: ObserverType
  entityType: FeedEntityType
  entityId: string
  priorityTier: PriorityTier
  /** What was observed — a plain statement of fact. */
  observation: string
  /** Why it matters — the reasoning a human would want before acting. */
  reasoning: string
  /** What to do about it, in one sentence. */
  suggestedAction: string
  /** The one-click action's button label — "Open", "Call", "Resume", … */
  actionLabel: string
  /** Where the one-click action actually goes — an internal route, or
   * a `tel:` link for "Call". Always a real, working destination
   * (requirement 5: "not dead buttons"). */
  actionHref: string
  confidence: FeedConfidence
}
