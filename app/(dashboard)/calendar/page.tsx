import { CalendarDays } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function CalendarPage() {
  return (
    <>
      <SectionHeader
        title="Calendar"
        description="Vehicle availability and reservations at a glance"
      />
      <EmptyPlaceholder
        icon={CalendarDays}
        title="Calendar view is coming next"
        description="This is where you'll see every pickup, return and reservation laid out day by day across your fleet."
      />
    </>
  )
}
