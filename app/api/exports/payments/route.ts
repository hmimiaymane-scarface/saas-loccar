import type { NextRequest } from "next/server"

import { requireExportAccess, csvResponse } from "@/lib/exports"
import { getPaymentsLedger } from "@/lib/data"
import { toCsv } from "@/lib/csv"
import { formatDateTime } from "@/lib/format"
import type { PaymentTransactionType, PaymentMethod } from "@/types/rental"

export async function GET(request: NextRequest) {
  const access = await requireExportAccess(["owner", "manager", "accountant"])
  if ("response" in access) return access.response
  const { session } = access

  const params = request.nextUrl.searchParams

  const result = await getPaymentsLedger(
    session.company.id,
    {
      transactionType: (params.get("type") as PaymentTransactionType | null) ?? undefined,
      method: (params.get("method") as PaymentMethod | null) ?? undefined,
      dateFrom: params.get("from") ?? undefined,
      dateTo: params.get("to") ?? undefined,
      search: params.get("search") ?? undefined,
    },
    1,
    5000
  )

  const csv = toCsv(result.items, [
    { header: "Date", value: (p) => formatDateTime(p.paidAt) },
    { header: "Type", value: (p) => p.transactionType },
    { header: "Direction", value: (p) => (p.direction === "in" ? "In" : "Out") },
    { header: "Customer", value: (p) => p.customerName },
    { header: "Reservation", value: (p) => p.reservationReference ?? "" },
    { header: "Amount (MAD)", value: (p) => p.amountMad },
    { header: "Method", value: (p) => p.method },
    { header: "Reference", value: (p) => p.reference ?? "" },
    { header: "Recorded by", value: (p) => p.recordedByName ?? "" },
  ])

  return csvResponse(csv, "payments.csv")
}
