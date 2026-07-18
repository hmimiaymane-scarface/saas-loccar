import { Bell } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function NotificationsPage() {
  return (
    <>
      <SectionHeader
        title="Notifications"
        description="Updates that need your attention"
      />
      <EmptyPlaceholder
        icon={Bell}
        title="Notifications are coming next"
        description="Booking requests, overdue returns and payment reminders will show up here as they happen."
      />
    </>
  )
}
