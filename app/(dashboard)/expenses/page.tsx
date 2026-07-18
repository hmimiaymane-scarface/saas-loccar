import { Receipt } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function ExpensesPage() {
  return (
    <>
      <SectionHeader
        title="Expenses"
        description="Fuel, maintenance and other running costs"
      />
      <EmptyPlaceholder
        icon={Receipt}
        title="Expense tracking is coming next"
        description="Log fuel, maintenance, insurance and other running costs per vehicle or branch."
      />
    </>
  )
}
