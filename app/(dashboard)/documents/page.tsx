import { FileText } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function DocumentsPage() {
  return (
    <>
      <SectionHeader
        title="Documents"
        description="Contracts and files uploaded by your team"
      />
      <EmptyPlaceholder
        icon={FileText}
        title="Document storage is coming next"
        description="Drag and drop your manually created rental contracts and other files, and attach them to a booking or customer."
      />
    </>
  )
}
