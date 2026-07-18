import { ClipboardList } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function ReservationsPage() {
  return (
    <>
      <SectionHeader
        title="Reservations"
        description="Booking requests and confirmed reservations"
      />
      <EmptyPlaceholder
        icon={ClipboardList}
        title="Reservations list is coming next"
        description="Manage incoming booking requests, confirm reservations and track pickup and return details here."
      />
    </>
  )
}
