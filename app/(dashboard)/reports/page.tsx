import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import {
  getFinancialReport,
  getFleetPerformanceReport,
  getReservationPerformanceReport,
  getCustomerOverviewReport,
  getExpenseSummary,
} from "@/lib/data"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/status"
import { resolveReportPeriod, type ReportPeriod } from "@/lib/reports"
import { SectionHeader } from "@/components/domain/section-header"
import { PeriodSelector } from "@/components/domain/reports/period-selector"
import { FinancialReportCard } from "@/components/domain/reports/financial-report-card"
import { FleetPerformanceTable } from "@/components/domain/reports/fleet-performance-table"
import { ReservationPerformanceCard } from "@/components/domain/reports/reservation-performance-card"
import { CustomerOverviewCard } from "@/components/domain/reports/customer-overview-card"
import { SimpleBarChart } from "@/components/domain/reports/simple-bar-chart"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { InlineEmpty } from "@/components/domain/empty-placeholder"

const VALID_PERIODS: ReportPeriod[] = ["today", "this_week", "this_month", "last_month", "custom"]

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "accountant"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const period: ReportPeriod = VALID_PERIODS.includes(params.period as ReportPeriod)
    ? (params.period as ReportPeriod)
    : "this_month"

  const today = new Date().toISOString().slice(0, 10)
  const range = resolveReportPeriod(period, session.company.timezone, {
    from: params.from ?? today,
    to: params.to ?? today,
  })

  const companyId = session.company.id
  const [financial, fleet, reservations, customers, expenseSummary] = await Promise.all([
    getFinancialReport(companyId, range),
    getFleetPerformanceReport(companyId, range),
    getReservationPerformanceReport(companyId, range),
    getCustomerOverviewReport(companyId, range),
    getExpenseSummary(companyId, range.fromIso.slice(0, 10), range.toIso.slice(0, 10)),
  ])

  const revenueByVehicle = [...fleet.rows]
    .filter((r) => r.recordedRevenueMad > 0)
    .sort((a, b) => b.recordedRevenueMad - a.recordedRevenueMad)
    .slice(0, 6)
    .map((r) => ({ label: r.vehicleLabel, valueMad: r.recordedRevenueMad }))

  const expensesByCategory = [...expenseSummary.byCategory]
    .sort((a, b) => b.totalMad - a.totalMad)
    .slice(0, 6)
    .map((c) => ({ label: EXPENSE_CATEGORY_LABELS[c.category] ?? c.category, valueMad: c.totalMad }))

  return (
    <>
      <SectionHeader title="Reports" description="Business performance over time — recorded figures, not formal accounting." />

      <PeriodSelector current={period} />

      <div className="grid gap-4 lg:grid-cols-2">
        <FinancialReportCard report={financial} />
        <FleetPerformanceTable report={fleet} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReservationPerformanceCard report={reservations} />
        <CustomerOverviewCard report={customers} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by vehicle</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByVehicle.length > 0 ? (
              <SimpleBarChart data={revenueByVehicle} />
            ) : (
              <InlineEmpty>Not enough data yet — this fills in once vehicles start earning recorded revenue this period.</InlineEmpty>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Expenses by category</CardTitle>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length > 0 ? (
              <SimpleBarChart data={expensesByCategory} />
            ) : (
              <InlineEmpty>Not enough data yet — this fills in once expenses are recorded this period.</InlineEmpty>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
