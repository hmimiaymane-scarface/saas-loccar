import Link from "next/link"

import type { ActivityItem } from "@/types/rental"
import { activityIcon } from "@/components/domain/overview/activity-feed-card"
import { formatDateTime } from "@/lib/format"

function ActivityLogRow({ item }: { item: ActivityItem }) {
  const Icon = activityIcon[item.type]

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm text-foreground">{item.description}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatDateTime(item.timestamp)}</span>
          {item.actor && <span>· {item.actor}</span>}
          {item.reservationId && (
            <Link href={`/reservations/${item.reservationId}`} className="text-primary hover:underline">
              View reservation
            </Link>
          )}
          {item.vehicleId && (
            <Link href={`/fleet/${item.vehicleId}`} className="text-primary hover:underline">
              View vehicle
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export { ActivityLogRow }
