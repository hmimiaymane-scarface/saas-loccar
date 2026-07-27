"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

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
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const isMockModeLimitation = error.message.includes("Supabase is not configured")

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
      <CardContent>
        <Button onClick={() => unstable_retry()}>Try again</Button>
      </CardContent>
    </Card>
  )
}
