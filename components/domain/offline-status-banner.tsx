import Link from "next/link"
import { WifiOff, RefreshCw, AlertTriangle } from "lucide-react"

/** Roadmap phase 16 requirement 6 — a quiet, non-blocking status line
 * for the offline-queueable wizards. Deliberately says nothing when
 * everything is already synced (isOnline && pendingCount === 0 &&
 * needsReviewCount === 0) — successful sync is invisible
 * infrastructure, not something worth interrupting a field workflow to
 * announce.
 *
 * Roadmap phase 39 — added needsReviewCount. Before this phase nothing
 * anywhere surfaced a mutation stuck in needs_review (a REAL rejection
 * that needs a human, not a transient offline blip) — this is the
 * point-of-capture half of that fix; OfflineQueueIndicator (mobile
 * shell header) is the ambient, away-from-the-wizard half. */
function OfflineStatusBanner({
  isOnline,
  pendingCount,
  needsReviewCount = 0,
}: {
  isOnline: boolean
  pendingCount: number
  needsReviewCount?: number
}) {
  if (isOnline && pendingCount === 0 && needsReviewCount === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {needsReviewCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 shrink-0" />
            {needsReviewCount} saved item{needsReviewCount === 1 ? "" : "s"} couldn&apos;t sync and need{needsReviewCount === 1 ? "s" : ""} your attention.
          </span>
          <Link href="/offline-queue" className="shrink-0 font-medium underline underline-offset-2">
            Review
          </Link>
        </div>
      )}
      {(!isOnline || pendingCount > 0) && (
        <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          {!isOnline ? (
            <>
              <WifiOff className="size-3.5 shrink-0" />
              You&apos;re offline — captures are saved on this device and will sync automatically once you&apos;re back online.
            </>
          ) : (
            <>
              <RefreshCw className="size-3.5 shrink-0 animate-spin" />
              Syncing {pendingCount} saved item{pendingCount === 1 ? "" : "s"}…
            </>
          )}
        </div>
      )}
    </div>
  )
}

export { OfflineStatusBanner }
