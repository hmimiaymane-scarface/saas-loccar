import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Receipt } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getExpensesList, getExpenseSummary, getVehicles } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { Button } from "@/components/ui/button"
import { PaginationBar } from "@/components/domain/pagination-bar"
import { ExpenseFilters } from "@/components/domain/expenses/expense-filters"
import { ExpenseListItem } from "@/components/domain/expenses/expense-list-item"
import { ExpenseSummaryCards } from "@/components/domain/expenses/expense-summary-cards"
import { ExportButton } from "@/components/domain/export-button"
import type { ExpenseCategory } from "@/types/rental"

function monthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; vehicle?: string; from?: string; to?: string; search?: string; page?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "accountant"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const companyId = session.company.id
  const today = new Date().toISOString().slice(0, 10)

  const [vehicles, result, summary] = await Promise.all([
    getVehicles(companyId),
    getExpensesList(
      companyId,
      {
        category: params.category as ExpenseCategory | undefined,
        vehicleId: params.vehicle,
        dateFrom: params.from,
        dateTo: params.to,
        search: params.search,
      },
      page,
      25
    ),
    getExpenseSummary(companyId, params.from ?? monthStart(), params.to ?? today),
  ])

  const canRecord =
    ["owner", "manager", "accountant"].includes(session.role) ||
    (session.role === "agent" && session.company.agentsCanRecordExpenses)

  return (
    <>
      <SectionHeader
        title="Expenses"
        description={`${result.total} expense${result.total === 1 ? "" : "s"} on file`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton resource="expenses" />
            {canRecord && (
              <Button asChild>
                <Link href="/expenses/new">
                  <Plus />
                  Record expense
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <ExpenseSummaryCards summary={summary} />

      <ExpenseFilters vehicles={vehicles} />

      {result.items.length === 0 ? (
        <EmptyPlaceholder
          icon={Receipt}
          title="No expenses match your filters"
          description="Fuel, maintenance, insurance and other running costs you record appear here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {result.items.map((expense) => (
            <ExpenseListItem key={expense.id} expense={expense} />
          ))}
        </div>
      )}

      <PaginationBar total={result.total} page={result.page} pageSize={result.pageSize} />
    </>
  )
}
