import { redirect } from "next/navigation"

import { getSessionContext, toEmployee } from "@/lib/auth/session"
import { getNotificationFeed } from "@/lib/data"
import { AppShell } from "@/components/layout/app-shell"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionContext()

  // middleware.ts already redirects unauthenticated / not-yet-onboarded
  // requests before they reach here; this is the defense-in-depth fallback
  // (e.g. Supabase configured but middleware skipped in a test harness).
  if (!session) {
    redirect("/sign-in")
  }

  // Fetched once per navigation into the dashboard (this layout re-runs
  // on each request, App Router doesn't keep it mounted across route
  // changes here) — a reasonable refresh cadence without any client-side
  // polling, per the phase brief's "don't aggressively poll every page."
  const feed = await getNotificationFeed(session.company.id, session.userId, {
    maintenanceReminderDays: session.company.maintenanceReminderDays,
    documentExpiryWarningDays: session.company.documentExpiryWarningDays,
    overdueGracePeriodHours: session.company.overdueGracePeriodHours,
    mutedTypes: session.company.mutedNotificationTypes,
  })

  return (
    <AppShell company={session.company} employee={toEmployee(session)} notifications={feed.items.slice(0, 6)} unreadCount={feed.unreadCount}>
      {children}
    </AppShell>
  )
}
