import { WifiOff, RefreshCw } from "lucide-react"

/** Roadmap phase 16 requirement 6 — a quiet, non-blocking status line
 * for the offline-queueable wizards. Deliberately says nothing when
 * everything is already synced (isOnline && pendingCount === 0) —
 * successful sync is invisible infrastructure, not something worth
 * interrupting a field workflow to announce. */
function OfflineStatusBanner({ isOnline, pendingCount }: { isOnline: boolean; pendingCount: number }) {
  if (isOnline && pendingCount === 0) return null

  return (
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
  )
}

export { OfflineStatusBanner }
