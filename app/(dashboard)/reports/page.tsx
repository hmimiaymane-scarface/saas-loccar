import { BarChart3 } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function ReportsPage() {
  return (
    <>
      <SectionHeader
        title="Reports"
        description="Business performance over time"
      />
      <EmptyPlaceholder
        icon={BarChart3}
        title="Reports are coming next"
        description="Revenue, fleet utilisation and customer trends will live here once bookings start flowing through the platform."
      />
    </>
  )
}
