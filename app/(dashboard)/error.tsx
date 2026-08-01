"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"

import { getErrorReference } from "@/lib/error-reference"
import { trackUsageEvent } from "@/lib/analytics/track"
import { logOperationalEvent } from "@/lib/observability/log"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/**
 * Productization wave 1 phase 8 — this app had no error boundary
 * anywhere (`find app -iname "error*.tsx"` returned nothing) before
 * this. Most unhandled crashes across the app share one root cause:
 * a server action calls `createClient()` (`lib/supabase/server.ts`)
 * unconditionally, which throws "Supabase is not configured..." in
 * mock mode — confirmed across roughly 20 `actions.ts` files app-wide
 * during this phase's audit. Patching every one of those individually would
 * be high effort for low marginal value once this exists: Next.js
 * routes an uncaught Server Action error through the same
 * error-boundary mechanism as a render error, so this single file
 * turns all of them into a graceful recovery screen instead of a raw
 * crash. See docs/failure-registry.md for the full inventory this
 * covers.
 *
 * Roadmap phase 43 — the recovery screen itself had two real gaps
 * against its own goal: no way back to anywhere except retrying the
 * exact thing that just failed (no safe navigation), and nothing a
 * user could quote back to support (no debug reference). Both fixed
 * here rather than by touching the ~20 error-prone actions themselves.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const router = useRouter()

  const isMockModeLimitation = error.message.includes("Supabase is not configured")

  useEffect(() => {
    console.error(error)
    // Roadmap phase 58 — a mock-mode limitation crash is an artifact of
    // this demo environment, not a real owner-facing failure; counting
    // it would swamp genuine "error rate" signal with noise unique to
    // running without a connected Supabase project.
    if (!isMockModeLimitation) {
      // Two different tables, two different audiences, both worth
      // writing: trackUsageEvent's error_occurred is product-usage
      // signal (part of a specific flow's error rate); phase 59's
      // logOperationalEvent is system-health evidence (did the app
      // break, independent of which product flow it happened in).
      void trackUsageEvent("error_occurred", {
        metadata: { context: "crash_boundary", message: error.message, digest: error.digest ?? null },
      })
      void logOperationalEvent({
        source: "frontend",
        context: "dashboard_error_boundary",
        message: error.message,
        metadata: { digest: error.digest ?? null },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const reference = getErrorReference(error)

  return (
    <Card className="mx-auto mt-12 max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" />
          {isMockModeLimitation ? "Not available in demo mode" : "Something went wrong"}
        </CardTitle>
        <CardDescription>
          {isMockModeLimitation
            ? "This action needs a connected Supabase project — it can't run against demo data."
            : "An unexpected error interrupted this page. Your other data is unaffected."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => unstable_retry()}>Try again</Button>
          <Button variant="outline" onClick={() => router.back()}>
            Go back
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/overview">Go to Overview</Link>
          </Button>
        </div>
        {!isMockModeLimitation && (
          <p className="text-xs text-muted-foreground">
            If this keeps happening, share this reference with support:{" "}
            <span className="font-mono text-foreground">{reference}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
