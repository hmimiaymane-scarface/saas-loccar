"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Check, CheckCheck, Bell } from "lucide-react"

import { markNotificationRead, markAllNotificationsRead, dismissLiveAlert } from "@/app/(dashboard)/notifications/actions"
import type { NotificationItem } from "@/types/rental"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

const PRIORITY_TONE: Record<NotificationItem["priority"], string> = {
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  normal: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  high: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  urgent: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
}

function groupByDate(items: NotificationItem[]) {
  const groups = new Map<string, NotificationItem[]>()
  for (const item of items) {
    const day = item.createdAt.slice(0, 10)
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day)!.push(item)
  }
  return Array.from(groups.entries())
}

function NotificationList({ initialItems }: { initialItems: NotificationItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [isPending, startTransition] = useTransition()

  const unread = items.filter((i) => !i.isRead)

  function markOne(item: NotificationItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)))
    startTransition(async () => {
      if (item.source === "live") {
        await dismissLiveAlert({ key: item.id, type: item.type, title: item.title, description: item.description, href: item.href })
      } else {
        await markNotificationRead(item.id)
      }
    })
  }

  function markAll() {
    const liveUnread = unread.filter((i) => i.source === "live")
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })))
    startTransition(async () => {
      await markAllNotificationsRead(
        liveUnread.map((i) => ({ key: i.id, type: i.type, title: i.title, description: i.description, href: i.href }))
      )
    })
  }

  if (items.length === 0) {
    return <EmptyPlaceholder icon={Bell} title="No notifications" description="You'll see pickups, returns, maintenance and other alerts here as they come up." />
  }

  return (
    <div className="flex flex-col gap-4">
      {unread.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={markAll} disabled={isPending}>
            <CheckCheck className="size-3.5" />
            Mark all as read
          </Button>
        </div>
      )}
      {groupByDate(items).map(([day, dayItems]) => (
        <div key={day} className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{formatDateTime(dayItems[0].createdAt).split(",")[0]}</p>
          <div className="flex flex-col divide-y divide-border rounded-3xl border border-border bg-card">
            {dayItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3">
                <Link href={item.href ?? "/notifications"} className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm", item.isRead ? "text-muted-foreground" : "font-medium text-foreground")}>
                      {item.title}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", PRIORITY_TONE[item.priority])}>
                      {item.priority}
                    </span>
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                </Link>
                {!item.isRead && (
                  <Button variant="ghost" size="icon-sm" onClick={() => markOne(item)} disabled={isPending} title="Mark as read">
                    <Check className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export { NotificationList }
