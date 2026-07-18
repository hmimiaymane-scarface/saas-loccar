import { Wrench } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function MaintenancePage() {
  return (
    <>
      <SectionHeader
        title="Maintenance"
        description="Service history, alerts and damage reports"
      />
      <EmptyPlaceholder
        icon={Wrench}
        title="Maintenance tracking is coming next"
        description="Log service history, get alerts before things are due, and record damage reports with photos."
      />
    </>
  )
}
