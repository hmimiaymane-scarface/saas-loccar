"use client"

import { useOptimistic, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PartyPopper } from "lucide-react"

import { dismissFeedItemAction } from "@/app/(dashboard)/operations-feed/actions"
import { InsightFeedItem } from "@/components/domain/intelligence/insight-feed-item"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
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

  function handleAction(href: string) {
    if (href.startsWith("tel:") || href.startsWith("http")) {
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
          onAction={() => handleAction(card.actionHref)}
          onDismiss={card.dismissible ? () => handleDismiss(card.id) : undefined}
        />
      ))}
    </div>
  )
}

export { NeedsAttentionSection }
