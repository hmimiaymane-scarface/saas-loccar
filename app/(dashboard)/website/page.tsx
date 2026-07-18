import { Globe } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function WebsitePage() {
  return (
    <>
      <SectionHeader
        title="Website"
        description="Your branded public rental website"
      />
      <EmptyPlaceholder
        icon={Globe}
        title="Your public website is coming next"
        description="A branded booking site for your customers, built from the fleet and rates you manage here."
      />
    </>
  )
}
