import { redirect } from "next/navigation"
import { Wallet, TrendingUp, AlertTriangle } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import {
  getOverviewMetrics,
  getTodayTimeline,
  getFleetOverview,
  getRecentBookingRequests,
  getRecentActivity,
  getLiveAlerts,
} from "@/lib/data"
import { formatMad } from "@/lib/format"
import { SectionHeader } from "@/components/domain/section-header"
import { StatCard } from "@/components/domain/stat-card"
import { TodayTimeline } from "@/components/domain/overview/today-timeline"
import { FleetVisualGrid } from "@/components/domain/overview/fleet-visual-grid"
import { BookingRequestsCard } from "@/components/domain/overview/booking-requests-card"
import { ActivityFeedCard } from "@/components/domain/overview/activity-feed-card"
import { NeedsAttentionCard } from "@/components/domain/overview/needs-attention-card"
import { FinancialSummaryCard } from "@/components/domain/overview/financial-summary-card"

export default async function OverviewPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const companyId = session.company.id

  const [metrics, timeline, fleet, requests, activity, alerts] = await Promise.all([
    getOverviewMetrics(companyId),
    getTodayTimeline(companyId),
    getFleetOverview(companyId),
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
          numericValue={metrics.revenueTodayMad}
          formatter="mad"
          icon={Wallet}
          hint={`${metrics.todayPickupsCount} pickups · ${metrics.todayReturnsCount} returns today`}
        />
        <StatCard
          label="Revenue this month"
          value={formatMad(metrics.revenueThisMonthMad)}
          numericValue={metrics.revenueThisMonthMad}
          formatter="mad"
          icon={TrendingUp}
          hint="1st of the month – today"
        />
        <StatCard
          label="Outstanding balance"
          value={formatMad(metrics.outstandingBalanceMad)}
          numericValue={metrics.outstandingBalanceMad}
          formatter="mad"
          icon={AlertTriangle}
          tone={metrics.outstandingBalanceMad > 0 ? "warning" : "default"}
          hint="Unpaid and partially paid bookings"
          className="sm:col-span-2 xl:col-span-1"
        />
      </div>

      <TodayTimeline entries={timeline} />

      <FleetVisualGrid vehicles={fleet} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FinancialSummaryCard
            expensesThisMonthMad={metrics.expensesThisMonthMad}
            knownOperatingResultMad={metrics.knownOperatingResultMad}
            depositsHeldMad={metrics.depositsHeldMad}
          />
          <BookingRequestsCard requests={requests} />
        </div>
        <ActivityFeedCard items={activity} />
      </div>
    </>
  )
}
