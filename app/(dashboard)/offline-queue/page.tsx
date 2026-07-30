import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { SectionHeader } from "@/components/domain/section-header"
import { OfflineQueueReviewList } from "@/components/domain/offline-queue-review-list"

/**
 * Roadmap phase 39 — deliberately not added to MobileBottomNav (same
 * "temporary/detail route, not primary nav" precedent phase 12's own
 * /operations-feed page used) — reached only via
 * OfflineQueueIndicator's link, since it's a detail/resolution screen,
 * not something an employee browses to on its own.
 */
export default async function OfflineQueuePage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  return (
    <>
      <SectionHeader title="Sync issues" description="Field captures saved on this device that are still syncing or need your attention" />
      <OfflineQueueReviewList />
    </>
  )
}
