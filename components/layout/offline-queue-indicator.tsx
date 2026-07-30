"use client"

import Link from "next/link"
import { CloudOff, RefreshCw } from "lucide-react"

import { useOfflineQueue } from "@/hooks/use-offline-queue"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Roadmap phase 39 ("Offline Queue Hardening") — before this, the only
 * places that ever knew a mutation was pending or stuck in
 * needs_review were the three specific wizard/upload components that
 * called useOfflineQueue directly. An employee who queued something
 * offline and then didn't personally return to that exact reservation
 * (or whose browser restarted) had no way to discover unsynced or
 * stuck work existed anywhere else in the app. Mounting the hook here
 * — MobileShell renders on every mobile page — makes both syncing and
 * visibility ambient rather than tied to one wizard's lifetime.
 *
 * Deliberately mobile-only (not added to the desktop AppShell): the
 * offline queue itself only exists for this app's mobile field
 * workflows (see lib/offline/sync.ts's own doc comment) — desktop
 * never queues anything, so there's nothing for a desktop indicator to
 * ever show.
 */
function OfflineQueueIndicator({ companyId }: { companyId: string }) {
  const { pendingCount, needsReviewCount } = useOfflineQueue(companyId)
  if (pendingCount === 0 && needsReviewCount === 0) return null

  const needsAttention = needsReviewCount > 0
  const count = needsAttention ? needsReviewCount : pendingCount

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={needsAttention ? `${needsReviewCount} saved item${needsReviewCount === 1 ? "" : "s"} need your attention` : `${pendingCount} saved item${pendingCount === 1 ? "" : "s"} still syncing`}
      asChild
    >
      <Link href="/offline-queue">
        {needsAttention ? <CloudOff className="size-[18px]" /> : <RefreshCw className="size-[18px] animate-spin" />}
        <span
          className={cn(
            "absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full text-[9px] font-medium text-white",
            needsAttention ? "bg-amber-500" : "bg-muted-foreground"
          )}
        >
          {count > 9 ? "9+" : count}
        </span>
      </Link>
    </Button>
  )
}

export { OfflineQueueIndicator }
