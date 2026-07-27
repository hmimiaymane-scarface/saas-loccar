import { redirect } from "next/navigation"
import { Wallet } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getPaymentsLedger, getPaymentsSummary, getBookings, getCustomers } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { PaginationBar } from "@/components/domain/pagination-bar"
import { PaymentsSummaryCards } from "@/components/domain/payments/payments-summary-cards"
import { PaymentFilters } from "@/components/domain/payments/payment-filters"
import { PaymentListItem } from "@/components/domain/payments/payment-list-item"
import { RecordPaymentForm } from "@/components/domain/payments/record-payment-form"
import { ExportButton } from "@/components/domain/export-button"
import type { PaymentTransactionType } from "@/types/rental"

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; search?: string; page?: string; reservationId?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent", "accountant"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const companyId = session.company.id

  const [summary, ledger, bookings, customers] = await Promise.all([
    getPaymentsSummary(companyId),
    getPaymentsLedger(
      companyId,
      { transactionType: params.type as PaymentTransactionType | undefined, search: params.search },
      page,
      25
    ),
    getBookings(companyId),
    getCustomers(companyId),
  ])

  const canRecord = ["owner", "manager", "agent", "accountant"].includes(session.role)

  return (
    <>
      <SectionHeader
        title="Payments"
        description="Revenue, deposits, charges and refunds — this platform never processes payments, it only tracks status."
        actions={<ExportButton resource="payments" />}
      />

      <PaymentsSummaryCards summary={summary} />

      {canRecord && <RecordPaymentForm bookings={bookings} customers={customers} defaultReservationId={params.reservationId} />}

      <PaymentFilters />

      {ledger.items.length === 0 ? (
        <EmptyPlaceholder
          icon={Wallet}
          title="No transactions match your filters"
          description="Rental payments, deposits, charges and refunds recorded during pickup, return or from the form above appear here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {ledger.items.map((payment) => (
            <PaymentListItem key={payment.id} payment={payment} />
          ))}
        </div>
      )}

      <PaginationBar total={ledger.total} page={ledger.page} pageSize={ledger.pageSize} />
    </>
  )
}
