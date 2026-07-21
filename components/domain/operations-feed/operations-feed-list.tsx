"use client"

import { useTransition } from "react"
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
 * routes), never a dead button. Dismiss is a real server action;
 * optimistic-enough via `router.refresh()` after it resolves, same
 * pattern as every other lifecycle action in this app.
 */
function OperationsFeedList({ items }: { items: OperationsFeedListItem[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

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
      await dismissFeedItemAction(id)
      router.refresh()
    })
  }

  if (items.length === 0) {
    return (
      <EmptyPlaceholder
        icon={CheckCircle2}
        title="Nothing needs your attention"
        description="The operations feed is quiet — no output is a good output."
      />
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {items.map((item) => (
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
