import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getOpenOperationsFeedItems } from "@/lib/operations-feed/data"
import { isSupabaseConfigured } from "@/lib/env"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { OperationsFeedList } from "@/components/domain/operations-feed/operations-feed-list"
import { RunObserversButton } from "@/components/domain/operations-feed/run-observers-button"

/**
 * Roadmap phase 12 requirement 7 — "a minimal page/panel sufficient to
 * see the feed working end-to-end... the real home is phase 13's
 * redesign." This page and phase 13's Command Center placement share
 * the same `getOpenOperationsFeedItems` read and the same
 * `OperationsFeedList` component — phase 13 relocates/embeds this,
 * it doesn't rebuild it.
 */
export default async function OperationsFeedPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  let items: Awaited<ReturnType<typeof getOpenOperationsFeedItems>> = []
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient()
      items = await getOpenOperationsFeedItems(supabase, session.company.id)
    } catch {
      items = []
    }
  }

  const canRunNow = ["owner", "manager"].includes(session.role)

  return (
    <>
      <SectionHeader
        title="Alerts"
        description="Things worth a look — most important first."
        actions={canRunNow ? <RunObserversButton /> : undefined}
      />
      <Card>
        <CardContent className="pt-6">
          <OperationsFeedList items={items} />
        </CardContent>
      </Card>
    </>
  )
}
