"use client"

import { useOptimistic, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PartyPopper } from "lucide-react"

import { dismissFeedItemAction } from "@/app/(dashboard)/operations-feed/actions"
import { InsightFeedItem } from "@/components/domain/intelligence/insight-feed-item"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { trackUsageEvent } from "@/lib/analytics/track"
import type { AttentionCard } from "@/lib/needs-attention"

/**
 * Productization wave 1 phase 11 — replaces `NeedsAttentionCard` plus
 * the old critical/operational operations-feed blocks with one section
 * over `buildNeedsAttentionFeed()`'s merged, sorted card list. Reuses
 * `InsightFeedItem` and the exact tel:/http-vs-router.push handling
 * `OperationsFeedList` already established — only `card.dismissible`
 * cards call `dismissFeedItemAction` (the rest have no
 * `operations_feed_items` row to dismiss).
 *
 * Roadmap phase 40 — same optimistic-dismiss reasoning as
 * `OperationsFeedList` (see its own comment): reversible, non-financial,
 * safe to remove from view before the server confirms.
 */
function NeedsAttentionSection({ cards, isNewAccount = false }: { cards: AttentionCard[]; isNewAccount?: boolean }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimisticCards, dismissOptimistically] = useOptimistic(
    cards,
    (state, dismissedId: string) => state.filter((card) => card.id !== dismissedId)
  )

  // card.id is a composite string (e.g. "booking-request:<uuid>"), not
  // itself a uuid — it goes in metadata, not the entityId column, which
  // rejects non-uuid values and would otherwise drop the whole event.
  function handleAction(card: AttentionCard) {
    void trackUsageEvent("alert_action_used", {
      metadata: { cardId: card.id, priority: card.priority, actionLabel: card.actionLabel },
    })
    if (card.actionHref.startsWith("tel:") || card.actionHref.startsWith("http")) {
      window.open(card.actionHref, "_self")
    } else {
      router.push(card.actionHref)
    }
  }

  function handleDismiss(card: AttentionCard) {
    void trackUsageEvent("alert_dismissed", { metadata: { cardId: card.id, priority: card.priority } })
    startTransition(async () => {
      dismissOptimistically(card.id)
      await dismissFeedItemAction(card.id)
      router.refresh()
    })
  }

  if (optimisticCards.length === 0) {
    return isNewAccount ? (
      <EmptyPlaceholder
        icon={PartyPopper}
        title="You're all set up"
        description="Nothing needs your attention yet because there's nothing in your fleet yet — add your first vehicle to start taking reservations."
        action={{ label: "Add vehicle", href: "/fleet/new" }}
      />
    ) : (
      <EmptyPlaceholder
        icon={PartyPopper}
        title="Nothing needs you right now"
        description="Everything that matters today is already handled."
      />
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-3xl border border-border px-4">
      {optimisticCards.map((card) => (
        <InsightFeedItem
          key={card.id}
          priority={card.priority}
          title={card.title}
          description={card.description}
          actionLabel={card.actionLabel}
          onAction={() => handleAction(card)}
          onDismiss={card.dismissible ? () => handleDismiss(card) : undefined}
        />
      ))}
    </div>
  )
}

export { NeedsAttentionSection }
