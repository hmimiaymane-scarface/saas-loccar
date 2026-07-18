import { Wallet } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function PaymentsPage() {
  return (
    <>
      <SectionHeader
        title="Payments"
        description="Paid, partially paid and unpaid balances"
      />
      <EmptyPlaceholder
        icon={Wallet}
        title="Payment tracking is coming next"
        description="Record what's been paid, partially paid or is still owed on every booking. This platform never processes payments — it only tracks status."
      />
    </>
  )
}
