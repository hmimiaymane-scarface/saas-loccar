"use client"

import { useOptimistic, useTransition } from "react"
import { useRouter } from "next/navigation"

import { dismissFeedItemAction } from "@/app/(dashboard)/operations-feed/actions"
import { InsightFeedItem, type InsightPriority } from "@/components/domain/intelligence/insight-feed-item"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { CheckCircle2 } from "lucide-react"
import type { PriorityTier } from "@/lib/operations-feed/types"

const TIER_TO_PRIORITY: Record<PriorityTier, InsightPriority> = {
  critical: "critical",
  operational: "operational",
  business_health: "important",
  informational: "informational",
}

export interface OperationsFeedListItem {
  id: string
  priorityTier: PriorityTier
  observation: string
  reasoning: string
  suggestedAction: string
  actionLabel: string
  actionHref: string
}

/**
 * Roadmap phase 12 requirements 3+5 — reuses phase 02's
 * `InsightFeedItem` (per the requirement's own instruction) with real
 * one-click actions: `actionHref` always navigates somewhere real
 * (an internal route, or a `tel:` link for "Call" — handled with a
 * hard navigation since Next's router only understands internal
 * routes), never a dead button.
 *
 * Roadmap phase 40 — dismiss used to wait on the full server round
 * trip (dismiss action, then `router.refresh()`) before the item
 * visibly left the list, which reads as sluggish on a slow connection
 * for an action that's genuinely safe to show instantly: dismissing an
 * Operations Feed item is reversible in spirit (the reconciler in
 * `lib/operations-feed/run.ts` re-surfaces it if the underlying
 * condition resolves and later recurs) and touches no money/inventory
 * state. `useOptimistic` removes it from view the moment it's clicked;
 * if the server call fails, the transition ends without a
 * `router.refresh()` ever changing the base `items` prop, so the
 * optimistic list reverts to including it again — the same "safe
 * because reversible" reasoning does NOT extend to reservation/
 * payment/deposit actions elsewhere in this app, which stay on the
 * wait-for-the-server pattern deliberately.
 */
function OperationsFeedList({ items }: { items: OperationsFeedListItem[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimisticItems, dismissOptimistically] = useOptimistic(
    items,
    (state, dismissedId: string) => state.filter((item) => item.id !== dismissedId)
  )

  function handleAction(href: string) {
    if (href.startsWith("tel:") || href.startsWith("http")) {
      // A hard navigation, not an internal route — router.push only
      // understands app routes. window.open(..., "_self") navigates
      // the current tab without directly assigning to
      // window.location (flagged by this repo's lint config as an
      // external-mutation hazard for the React Compiler).
      window.open(href, "_self")
    } else {
      router.push(href)
    }
  }

  function handleDismiss(id: string) {
    startTransition(async () => {
      dismissOptimistically(id)
      await dismissFeedItemAction(id)
      router.refresh()
    })
  }

  if (optimisticItems.length === 0) {
    return (
      <EmptyPlaceholder
        icon={CheckCircle2}
        title="Nothing needs your attention"
        description="All quiet right now — that's a good thing."
      />
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {optimisticItems.map((item) => (
        <InsightFeedItem
          key={item.id}
          priority={TIER_TO_PRIORITY[item.priorityTier]}
          title={item.observation}
          description={`${item.reasoning} ${item.suggestedAction}`}
          actionLabel={item.actionLabel}
          onAction={() => handleAction(item.actionHref)}
          onDismiss={() => handleDismiss(item.id)}
        />
      ))}
    </div>
  )
}

export { OperationsFeedList }
