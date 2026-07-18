import { Car } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function FleetPage() {
  return (
    <>
      <SectionHeader
        title="Fleet"
        description="Every vehicle, its status and daily rate"
      />
      <EmptyPlaceholder
        icon={Car}
        title="Fleet management is coming next"
        description="Add vehicles, track their status and mileage, and set daily rates for each car in your fleet."
      />
    </>
  )
}
