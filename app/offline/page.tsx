import { WifiOff } from "lucide-react"

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

/**
 * Roadmap phase 16 — served by public/sw.js directly from its cache
 * when a navigation to an offline-critical route (mobile home,
 * pickup/return) fails with no cached copy of that specific page to
 * fall back to. A plain static page, deliberately no data fetching —
 * it exists to be servable with zero network at all.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted/40 px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
            RO
          </div>
          <span className="font-heading text-base font-medium text-foreground">Rental Office</span>
        </div>

        <Card>
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <WifiOff className="size-5" />
            </div>
            <CardTitle className="text-lg">You&apos;re offline</CardTitle>
            <CardDescription>
              This page hasn&apos;t been loaded on this device yet, so it can&apos;t open without a connection. Any
              inspection, photo, or document you were already working on is safe and queued — it&apos;ll sync
              automatically once you&apos;re back online.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Reconnect and reload to continue.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
