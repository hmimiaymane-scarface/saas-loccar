"use client"

import Link from "next/link"
import { Bell, ArrowRight } from "lucide-react"

import type { NotificationItem } from "@/types/rental"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toneClasses, insightPriorityTone } from "@/lib/tone"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu"

const PRIORITY_DOT: Record<NotificationItem["priority"], string> = Object.fromEntries(
  Object.entries(insightPriorityTone).map(([priority, tone]) => [priority, toneClasses[tone].fill])
) as Record<NotificationItem["priority"], string>

function NotificationBell({ notifications, unreadCount }: { notifications: NotificationItem[]; unreadCount: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-medium text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">Notifications</span>
          {unreadCount > 0 && <span className="text-xs text-muted-foreground">{unreadCount} unread</span>}
        </div>
        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={n.href ?? "/notifications"}
                className="flex items-start gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-muted"
              >
                <span aria-hidden="true" className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.isRead ? "bg-transparent" : PRIORITY_DOT[n.priority])} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-foreground">{n.title}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <Link
          href="/notifications"
          className="flex items-center justify-center gap-1.5 border-t border-border px-3 py-2.5 text-xs font-medium text-primary hover:underline"
        >
          View all
          <ArrowRight className="size-3.5" />
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { NotificationBell }
