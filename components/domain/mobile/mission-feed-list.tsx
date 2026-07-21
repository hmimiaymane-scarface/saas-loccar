import Link from "next/link"
import { AlertTriangle, Clock, Info, PartyPopper } from "lucide-react"

import { cn } from "@/lib/utils"
import type { MissionCard, MissionCardTone } from "@/lib/mobile/mission-feed"

const TONE_STYLES: Record<MissionCardTone, { icon: typeof AlertTriangle; classes: string }> = {
  critical: { icon: AlertTriangle, classes: "border-red-200 bg-red-50/60 text-red-700 dark:border-red-500/30 dark:bg-red-500/5 dark:text-red-400" },
  operational: {
    icon: Clock,
    classes: "border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-400",
  },
  informational: { icon: Info, classes: "border-border bg-card text-muted-foreground" },
}

/** Roadmap phase 16 — the mission feed's own card list, deliberately
 * NOT reusing OperationsFeedList (that component renders confidence
 * indicators and dismiss actions tuned for the desktop-only phase-12
 * feed; these cards are a mix of reservation-derived items with no
 * "dismiss" concept at all — completing the underlying task is what
 * removes them, same as the bible's own framing). Large, tappable rows,
 * one thumb-reachable tap target each. */
function MissionFeedList({ cards }: { cards: MissionCard[] }) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-10 text-center">
        <PartyPopper className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Nothing needs you right now</p>
        <p className="text-xs text-muted-foreground">New work will show up here as it comes in.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {cards.map((card) => {
        const { icon: Icon, classes } = TONE_STYLES[card.tone]
        return (
          <Link
            key={card.id}
            href={card.href}
            className={cn("flex items-start gap-3 rounded-3xl border px-4 py-3.5 transition-opacity active:opacity-70", classes)}
          >
            <Icon className="mt-0.5 size-5 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{card.title}</span>
              <span className="truncate text-xs text-muted-foreground">{card.subtitle}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

export { MissionFeedList }
