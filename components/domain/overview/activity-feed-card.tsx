import {
  ClipboardList,
  CheckCircle2,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Wrench,
  RefreshCcw,
  UserPlus,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react"

import type { ActivityItem, ActivityType } from "@/types/rental"
import { formatRelativeTime } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const activityIcon: Record<ActivityType, LucideIcon> = {
  reservation_requested: ClipboardList,
  reservation_confirmed: CheckCircle2,
  reservation_status_changed: RefreshCcw,
  reservation_updated: ClipboardList,
  payment_recorded: Wallet,
  vehicle_picked_up: ArrowUpRight,
  vehicle_returned: ArrowDownLeft,
  vehicle_status_changed: RefreshCcw,
  maintenance_completed: Wrench,
  customer_created: UserPlus,
  document_uploaded: FileText,
  member_invited: UserRoundPlus,
}

function ActivityFeedCard({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-5">
          {items.map((item) => {
            const Icon = activityIcon[item.type]
            return (
              <li key={item.id} className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm text-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(item.timestamp, new Date("2026-07-18T10:00:00+01:00"))}
                    {item.actor ? ` · ${item.actor}` : ""}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

export { ActivityFeedCard }
