"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Check, CheckCheck, Bell } from "lucide-react"

import { markNotificationRead, markAllNotificationsRead, dismissLiveAlert } from "@/app/(dashboard)/notifications/actions"
import type { NotificationItem } from "@/types/rental"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toneClasses, insightPriorityTone } from "@/lib/tone"
import { vibrate } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

/** Items arrive already sorted priority-first (see
 * lib/data.ts#getNotificationFeed — roadmap phase 18 requirement 6), so
 * a day's items can appear out of chronological order relative to each
 * other's *day groups* if grouped in first-encountered order. Day
 * sections themselves stay newest-first (the familiar, predictable
 * axis); each section's own items keep the priority order they arrived
 * in — a Critical item still surfaces above an Informational one within
 * the same day. */
function groupByDate(items: NotificationItem[]) {
  const groups = new Map<string, NotificationItem[]>()
  for (const item of items) {
    const day = item.createdAt.slice(0, 10)
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day)!.push(item)
  }
  return Array.from(groups.entries()).sort(([dayA], [dayB]) => dayB.localeCompare(dayA))
}

/** One notification row — shared by the main (attention) list and the
 * collapsed informational section below it, so the two never drift
 * apart in what a row actually looks like. */
function NotificationRow({ item, isPending, onMarkRead }: { item: NotificationItem; isPending: boolean; onMarkRead: (item: NotificationItem) => void }) {
  const tone = toneClasses[insightPriorityTone[item.priority]]
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link href={item.href ?? "/notifications"} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm", item.isRead ? "text-muted-foreground" : "font-medium text-foreground")}>{item.title}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", tone.badge)}>{item.priority}</span>
          </div>
          {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
        </Link>
        {item.actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {item.actions.map((action) => (
              <a key={action.href + action.label} href={action.href} className="text-xs font-medium text-primary hover:underline">
                {action.label}
              </a>
            ))}
          </div>
        )}
      </div>
      {!item.isRead && (
        <Button variant="ghost" size="icon-sm" onClick={() => onMarkRead(item)} disabled={isPending} title="Mark as read">
          <Check className="size-4" />
        </Button>
      )}
    </div>
  )
}

function NotificationList({ initialItems }: { initialItems: NotificationItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const unread = items.filter((i) => !i.isRead)

  // Productization wave 1 phase 8 — found via the failure-registry
  // audit: this used to set isRead optimistically and never check the
  // action's result, so a failed write (e.g. mock mode's
  // createClient() throw) left the UI silently claiming a critical
  // alert was dismissed when nothing was actually persisted. Both
  // handlers now revert the optimistic update and surface an error on
  // failure instead.
  function markOne(item: NotificationItem) {
    vibrate("light")
    setError(null)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)))
    startTransition(async () => {
      const result =
        item.source === "live"
          ? await dismissLiveAlert({ key: item.id, type: item.type, title: item.title, description: item.description, href: item.href })
          : await markNotificationRead(item.id)
      if (result.error) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isRead: false } : i)))
        setError(result.error)
      }
    })
  }

  function markAll() {
    vibrate("light")
    setError(null)
    const liveUnread = unread.filter((i) => i.source === "live")
    const unreadIds = new Set(unread.map((i) => i.id))
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })))
    startTransition(async () => {
      const result = await markAllNotificationsRead(
        liveUnread.map((i) => ({ key: i.id, type: i.type, title: i.title, description: i.description, href: i.href }))
      )
      if (result.error) {
        setItems((prev) => prev.map((i) => (unreadIds.has(i.id) ? { ...i, isRead: false } : i)))
        setError(result.error)
      }
    })
  }

  if (items.length === 0) {
    return <EmptyPlaceholder icon={Bell} title="No notifications" description="You'll see pickups, returns, maintenance and other alerts here as they come up." />
  }

  // Roadmap phase 35 ("Notification Center Rebuild") — informational
  // items are never deleted, just kept out of the main feed, same
  // "still reachable on a secondary surface" principle phase 13 already
  // applied to the Operations Feed's own informational-tier items.
  const attention = items.filter((i) => i.priority !== "informational")
  const informational = items.filter((i) => i.priority === "informational")

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {unread.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={markAll} disabled={isPending}>
            <CheckCheck className="size-3.5" />
            Mark all as read
          </Button>
        </div>
      )}
      {attention.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs your attention right now.</p>
      ) : (
        groupByDate(attention).map(([day, dayItems]) => (
          <div key={day} className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{formatDateTime(dayItems[0].createdAt).split(",")[0]}</p>
            <div className="flex flex-col divide-y divide-border rounded-3xl border border-border bg-card">
              {dayItems.map((item) => (
                <NotificationRow key={item.id} item={item} isPending={isPending} onMarkRead={markOne} />
              ))}
            </div>
          </div>
        ))
      )}
      {informational.length > 0 && (
        <details className="group rounded-3xl border border-border">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-muted-foreground marker:content-none">
            Informational ({informational.length})
          </summary>
          <div className="flex flex-col divide-y divide-border border-t border-border">
            {informational.map((item) => (
              <NotificationRow key={item.id} item={item} isPending={isPending} onMarkRead={markOne} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export { NotificationList }
