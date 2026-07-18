import { redirect } from "next/navigation"
import { Wallet, TrendingUp, AlertTriangle } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import {
  getOverviewMetrics,
  getTodayPickups,
  getTodayReturns,
  getRecentBookingRequests,
  getRecentActivity,
  getLiveAlerts,
} from "@/lib/data"
import { formatMad } from "@/lib/format"
import { SectionHeader } from "@/components/domain/section-header"
import { StatCard } from "@/components/domain/stat-card"
import { FleetStatusCard } from "@/components/domain/overview/fleet-status-card"
import { PickupsReturnsCard } from "@/components/domain/overview/pickups-returns-card"
import { BookingRequestsCard } from "@/components/domain/overview/booking-requests-card"
import { ActivityFeedCard } from "@/components/domain/overview/activity-feed-card"
import { NeedsAttentionCard } from "@/components/domain/overview/needs-attention-card"
import { FinancialSummaryCard } from "@/components/domain/overview/financial-summary-card"

export default async function OverviewPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const companyId = session.company.id

  const [metrics, pickups, returns, requests, activity, alerts] = await Promise.all([
    getOverviewMetrics(companyId),
    getTodayPickups(companyId),
    getTodayReturns(companyId),
    getRecentBookingRequests(companyId),
    getRecentActivity(companyId),
    getLiveAlerts(companyId, {
      maintenanceReminderDays: session.company.maintenanceReminderDays,
      documentExpiryWarningDays: session.company.documentExpiryWarningDays,
    }),
  ])

  const firstName = (session.profile.fullName ?? "there").split(" ")[0]
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  return (
    <>
      <SectionHeader
        title="Overview"
        description={`Good morning, ${firstName} — here's how things stand today, ${today}.`}
      />

      <NeedsAttentionCard alerts={alerts} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Revenue today"
          value={formatMad(metrics.revenueTodayMad)}
          icon={Wallet}
          hint={`${metrics.todayPickupsCount} pickups · ${metrics.todayReturnsCount} returns today`}
        />
        <StatCard
          label="Revenue this month"
          value={formatMad(metrics.revenueThisMonthMad)}
          icon={TrendingUp}
          hint="1st of the month – today"
        />
        <StatCard
          label="Outstanding balance"
          value={formatMad(metrics.outstandingBalanceMad)}
          icon={AlertTriangle}
          tone={metrics.outstandingBalanceMad > 0 ? "warning" : "default"}
          hint="Unpaid and partially paid bookings"
          className="sm:col-span-2 xl:col-span-1"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FleetStatusCard
          total={metrics.fleetTotal}
          available={metrics.fleetAvailable}
          rented={metrics.fleetRented}
          reserved={metrics.fleetReserved}
          maintenance={metrics.fleetMaintenance}
          occupancyRate={metrics.occupancyRate}
        />
        <FinancialSummaryCard
          expensesThisMonthMad={metrics.expensesThisMonthMad}
          knownOperatingResultMad={metrics.knownOperatingResultMad}
          depositsHeldMad={metrics.depositsHeldMad}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <PickupsReturnsCard pickups={pickups} returns={returns} />
          <BookingRequestsCard requests={requests} />
        </div>
        <div className="flex flex-col gap-4">
          <ActivityFeedCard items={activity} />
        </div>
      </div>
    </>
  )
}
