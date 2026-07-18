import type { NextRequest } from "next/server"

import { requireExportAccess, csvResponse } from "@/lib/exports"
import { getExpensesList } from "@/lib/data"
import { toCsv } from "@/lib/csv"
import { formatDate } from "@/lib/format"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/status"
import type { ExpenseCategory } from "@/types/rental"

export async function GET(request: NextRequest) {
  const access = await requireExportAccess(["owner", "manager", "accountant"])
  if ("response" in access) return access.response
  const { session } = access

  const params = request.nextUrl.searchParams

  const result = await getExpensesList(
    session.company.id,
    {
      category: (params.get("category") as ExpenseCategory | null) ?? undefined,
      vehicleId: params.get("vehicle") ?? undefined,
      supplier: params.get("supplier") ?? undefined,
      dateFrom: params.get("from") ?? undefined,
      dateTo: params.get("to") ?? undefined,
      search: params.get("search") ?? undefined,
    },
    1,
    5000
  )

  const csv = toCsv(result.items, [
    { header: "Date", value: (e) => formatDate(e.expenseDate) },
    { header: "Category", value: (e) => EXPENSE_CATEGORY_LABELS[e.category] ?? e.category },
    { header: "Amount (MAD)", value: (e) => e.amountMad },
    { header: "Vehicle", value: (e) => e.vehicleLabel ?? "" },
    { header: "Supplier", value: (e) => e.supplier ?? "" },
    { header: "Method", value: (e) => e.method ?? "" },
    { header: "Description", value: (e) => e.description ?? "" },
    { header: "Linked to maintenance", value: (e) => (e.maintenanceRecordId ? "Yes" : "No") },
    { header: "Recorded by", value: (e) => e.recordedByName ?? "" },
  ])

  return csvResponse(csv, "expenses.csv")
}
