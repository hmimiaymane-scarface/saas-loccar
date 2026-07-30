import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getNotificationFeed } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { NotificationList } from "@/components/domain/notifications/notification-list"
import { RunRemindersButton } from "@/components/domain/notifications/run-reminders-button"

export default async function NotificationsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const feed = await getNotificationFeed(session.company.id, session.userId, {
    maintenanceReminderDays: session.company.maintenanceReminderDays,
    documentExpiryWarningDays: session.company.documentExpiryWarningDays,
    mutedTypes: session.company.mutedNotificationTypes,
  })

  const canRunRemindersNow = session.role === "owner" || session.role === "manager"

  return (
    <>
      <SectionHeader
        title="Notifications"
        description="Updates that need your attention"
        actions={canRunRemindersNow ? <RunRemindersButton /> : undefined}
      />
      <NotificationList initialItems={feed.items} />
    </>
  )
}
