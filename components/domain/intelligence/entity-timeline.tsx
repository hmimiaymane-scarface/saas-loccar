import type { ActivityItem } from "@/types/rental"
import { formatRelativeTime } from "@/lib/format"
import { activityIcon } from "@/components/domain/overview/activity-feed-card"
import { InlineEmpty } from "@/components/domain/empty-placeholder"
import { cn } from "@/lib/utils"

interface EntityTimelineProps {
  items: ActivityItem[]
  className?: string
}

/** Vertical timeline of every event for one entity (a vehicle, a
 * customer, a contract) — the bible's "every vehicle has a story"
 * (Chapter 5 §8) rendered generically. Consumes the same ActivityItem
 * shape phase 01's event backbone produces, and reuses
 * activity-feed-card's icon-per-type map instead of duplicating it. */
function EntityTimeline({ items, className }: EntityTimelineProps) {
  if (items.length === 0) {
    return <InlineEmpty>No activity yet.</InlineEmpty>
  }

  return (
    <ol className={cn("flex flex-col gap-5", className)}>
      {items.map((item) => {
        const Icon = activityIcon[item.type]
        return (
          <li key={item.id} className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon aria-hidden="true" className="size-4" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm text-foreground">{item.description || item.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(item.timestamp)}
                {item.actor ? ` · ${item.actor}` : ""}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export { EntityTimeline }
