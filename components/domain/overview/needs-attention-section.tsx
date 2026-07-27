"use client"

import { useTransition } from "react"
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
 */
function NeedsAttentionSection({ cards }: { cards: AttentionCard[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function handleAction(href: string) {
    if (href.startsWith("tel:") || href.startsWith("http")) {
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

  if (cards.length === 0) {
    return (
      <EmptyPlaceholder
        icon={PartyPopper}
        title="Nothing needs you right now"
        description="Everything that matters today is already handled."
      />
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-3xl border border-border px-4">
      {cards.map((card) => (
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
