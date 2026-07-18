import { Users } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function CustomersPage() {
  return (
    <>
      <SectionHeader
        title="Customers"
        description="Customer records, driving licences and documents"
      />
      <EmptyPlaceholder
        icon={Users}
        title="Customer records are coming next"
        description="Keep contact details, driving licences and booking history for every customer in one place."
      />
    </>
  )
}
