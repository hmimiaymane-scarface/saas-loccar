import { redirect } from "next/navigation"
import { Wallet, TrendingUp, AlertTriangle } from "lucide-react"

import { getSessionContext, type SessionContext } from "@/lib/auth/session"
import {
  getOverviewMetrics,
  getTodayTimeline,
  getFleetOverview,
  getRecentBookingRequests,
  getRecentActivity,
  getLiveAlerts,
  getFinancialReport,
  getFleetPerformanceReport,
  getReservationPerformanceReport,
  getCustomerOverviewReport,
  getTeamMembers,
  getPendingInvitations,
  hasFinancialReportsAccess,
} from "@/lib/data"
import { getExpiringDocuments } from "@/lib/documents"
import { resolveReportPeriod } from "@/lib/reports"
import { getFleetHealthRollup, getCustomerHealthRollup, type ScoreRollup } from "@/lib/intelligence-rollups"
import { getOpenOperationsFeedItems, type OperationsFeedItem } from "@/lib/operations-feed/data"
import { computeBusinessPulse, type BusinessPulseSummary } from "@/lib/business-pulse"
import { computeRevenueIntelligence, type RevenueIntelligenceResult } from "@/lib/revenue-intelligence"
import { searchContracts, type ContractSearchResult } from "@/lib/contracts/template-store"
import { getUpcomingReservationsMissingIdentityDocument } from "@/lib/customer-readiness-store"
import { buildNeedsAttentionFeed, type MissingIdentityDocumentFlag } from "@/lib/needs-attention"
import { filterByFinancialAccess } from "@/lib/notifications/permission-filter"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { formatMad } from "@/lib/format"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { StatCard } from "@/components/domain/stat-card"
import { TodayTimeline } from "@/components/domain/overview/today-timeline"
import { FleetVisualGrid } from "@/components/domain/overview/fleet-visual-grid"
import { ActivityFeedCard } from "@/components/domain/overview/activity-feed-card"
import { HomeSummaryStrip } from "@/components/domain/overview/home-summary-strip"
import { NeedsAttentionSection } from "@/components/domain/overview/needs-attention-section"
import { FinancialSummaryCard } from "@/components/domain/overview/financial-summary-card"
import { MorningBriefing } from "@/components/domain/overview/morning-briefing"
import { BusinessPulseGrid } from "@/components/domain/overview/business-pulse-grid"
import { HealthOverviewCard } from "@/components/domain/overview/health-overview-card"
import { RevenueIntelligenceCard } from "@/components/domain/overview/revenue-intelligence-card"
import { OperationsFeedList } from "@/components/domain/operations-feed/operations-feed-list"

/**
 * Roadmap phase 13 — bible Chapter 10, "the most important screen in
 * RentalOS." Everything in this function beyond the original phase-
 * pre-13 metrics/timeline/fleet/requests/activity/alerts calls is
 * live-Supabase-only (bulk intelligence reads, month-over-month
 * report comparisons, the operations feed) — same degrade-to-safe-
 * defaults convention as every AI/database-only feature since phase
 * 06, gathered here in one place so the page component itself stays
 * about layout, not fetch plumbing.
 */
async function loadIntelligenceExtras(session: SessionContext) {
  const empty = {
    feedItems: [] as OperationsFeedItem[],
    pulse: null as BusinessPulseSummary | null,
    revenueIntel: null as RevenueIntelligenceResult | null,
    revenueThisMonthMad: 0,
    fleetHealth: { averageScore: 0, entityCount: 0, bandCounts: {} } as ScoreRollup,
    customerHealth: { averageScore: 0, entityCount: 0, bandCounts: {} } as ScoreRollup,
    contractsAwaitingSignature: [] as ContractSearchResult[],
    missingDocuments: [] as MissingIdentityDocumentFlag[],
  }
  if (!isSupabaseConfigured) return empty

  try {
    const supabase = await createClient()
    const companyId = session.company.id
    const tz = session.company.timezone
    const thisMonth = resolveReportPeriod("this_month", tz)
    const lastMonth = resolveReportPeriod("last_month", tz)

    const [
      feedItems,
      fleetHealth,
      customerHealth,
      financialThisMonth,
      financialLastMonth,
      fleetPerfThisMonth,
      fleetPerfLastMonth,
      reservationPerfThisMonth,
      reservationPerfLastMonth,
      customerOverviewThisMonth,
      customerOverviewLastMonth,
      expiringDocs,
      teamMembers,
      pendingInvitations,
      alertsForMaintenance,
      contractsAwaitingSignatureResult,
      missingDocuments,
    ] = await Promise.all([
      getOpenOperationsFeedItems(supabase, companyId),
      getFleetHealthRollup(supabase, companyId),
      getCustomerHealthRollup(supabase, companyId),
      getFinancialReport(companyId, thisMonth),
      getFinancialReport(companyId, lastMonth),
      getFleetPerformanceReport(companyId, thisMonth),
      getFleetPerformanceReport(companyId, lastMonth),
      getReservationPerformanceReport(companyId, thisMonth),
      getReservationPerformanceReport(companyId, lastMonth),
      getCustomerOverviewReport(companyId, thisMonth),
      getCustomerOverviewReport(companyId, lastMonth),
      getExpiringDocuments(supabase, companyId, session.company.documentExpiryWarningDays),
      getTeamMembers(companyId),
      getPendingInvitations(companyId),
      getLiveAlerts(companyId, { maintenanceReminderDays: session.company.maintenanceReminderDays, documentExpiryWarningDays: session.company.documentExpiryWarningDays }),
      searchContracts(supabase, companyId, { status: "awaiting_signature" }, 1, 10),
      getUpcomingReservationsMissingIdentityDocument(supabase, companyId),
    ])

    const pulse = computeBusinessPulse({
      averageFleetHealthScore: fleetHealth.averageScore,
      newCustomersThisMonth: customerOverviewThisMonth.newCustomers,
      newCustomersLastMonth: customerOverviewLastMonth.newCustomers,
      reservationsThisMonth: reservationPerfThisMonth.created,
      reservationsTrailingAverage: reservationPerfLastMonth.created,
      revenueThisMonthMad: financialThisMonth.rentalPaymentsMad,
      revenueLastMonthMad: financialLastMonth.rentalPaymentsMad,
      maintenanceDueOrOverdueCount: alertsForMaintenance.filter((a) => a.type === "maintenance_due" || a.type === "maintenance_overdue").length,
      outstandingBalanceMad: financialThisMonth.outstandingBalanceMad,
      documentsExpiringCount: expiringDocs.length,
      activeTeamCount: teamMembers.filter((m) => m.status === "active").length,
      pendingInvitationsCount: pendingInvitations.length,
    })

    const revenueIntel = computeRevenueIntelligence(
      { revenueMad: financialThisMonth.rentalPaymentsMad, occupancyRate: fleetPerfThisMonth.occupancyRate, averageDurationDays: reservationPerfThisMonth.averageDurationDays },
      { revenueMad: financialLastMonth.rentalPaymentsMad, occupancyRate: fleetPerfLastMonth.occupancyRate, averageDurationDays: reservationPerfLastMonth.averageDurationDays }
    )

    return {
      feedItems,
      pulse,
      revenueIntel,
      revenueThisMonthMad: financialThisMonth.rentalPaymentsMad,
      fleetHealth,
      customerHealth,
      contractsAwaitingSignature: contractsAwaitingSignatureResult.items,
      missingDocuments,
    }
  } catch {
    return empty
  }
}

export default async function OverviewPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const companyId = session.company.id

  const [metrics, timeline, fleet, requests, activity, alerts, hasFinancialAccess, extras] = await Promise.all([
    getOverviewMetrics(companyId),
    getTodayTimeline(companyId),
    getFleetOverview(companyId),
    getRecentBookingRequests(companyId),
    getRecentActivity(companyId),
    getLiveAlerts(companyId, {
      maintenanceReminderDays: session.company.maintenanceReminderDays,
      documentExpiryWarningDays: session.company.documentExpiryWarningDays,
    }),
    hasFinancialReportsAccess(companyId),
    loadIntelligenceExtras(session),
  ])

  const firstName = (session.profile.fullName ?? "there").split(" ")[0]
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })

  // Bible Chapter 10 §2's five-level hierarchy: business_health-tier
  // feed items still get their own separate Opportunities section
  // (Level 4) — everything else "needs attention" (live alerts,
  // critical/operational feed items, booking requests, contract
  // signatures, missing documents) now merges into one Needs-You-Now
  // list instead of several separately-rendered blocks (productization
  // wave 1 phase 11). Financial-access filtering matches the
  // Notification Center's own rule (requirement 7 there): a role
  // without view_financial_reports never sees a payment-shaped card.
  const opportunityFeedItems = extras.feedItems.filter((i) => i.priorityTier === "business_health")
  const visibleAlerts = filterByFinancialAccess(alerts, hasFinancialAccess)
  const attentionCards = buildNeedsAttentionFeed({
    alerts: visibleAlerts,
    feedItems: extras.feedItems,
    bookingRequests: requests,
    contractsAwaitingSignature: extras.contractsAwaitingSignature,
    missingDocuments: extras.missingDocuments,
  })

  return (
    <>
      <SectionHeader title="Overview" description={`${today} — here's how things stand.`} />

      {/* Top summary, before any analytics. */}
      <HomeSummaryStrip metrics={metrics} />

      <MorningBriefing
        input={{
          firstName,
          todayLabel: today,
          pickupsCount: metrics.todayPickupsCount,
          returnsCount: metrics.todayReturnsCount,
          maintenanceDueCount: alerts.filter((a) => a.type === "maintenance_due" || a.type === "maintenance_overdue").length,
          occupancyRate: metrics.occupancyRate,
          revenueThisMonthMad: metrics.revenueThisMonthMad,
          topFeedItems: extras.feedItems.slice(0, 3),
        }}
      />

      {/* Needs You Now — impossible to miss, always first, every card
          has a real action (productization wave 1 phase 11). */}
      <NeedsAttentionSection cards={attentionCards} />

      {/* Level 2 — Today's Operations. */}
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

      {/* Level 3 — Business Health. */}
      {extras.pulse && <BusinessPulseGrid pulse={extras.pulse} />}
      <div className="grid gap-4 lg:grid-cols-2">
        {extras.revenueIntel && <RevenueIntelligenceCard result={extras.revenueIntel} revenueThisMonthMad={extras.revenueThisMonthMad} />}
        <div className="flex flex-col gap-4">
          <HealthOverviewCard title="Fleet Health Overview" rollup={extras.fleetHealth} />
          <HealthOverviewCard title="Customer Health" rollup={extras.customerHealth} />
        </div>
      </div>

      {/* Level 4 — Opportunities. */}
      {opportunityFeedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            <OperationsFeedList items={opportunityFeedItems} />
          </CardContent>
        </Card>
      )}

      {/* Level 5 — Historical Analysis. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FinancialSummaryCard
            expensesThisMonthMad={metrics.expensesThisMonthMad}
            knownOperatingResultMad={metrics.knownOperatingResultMad}
            depositsHeldMad={metrics.depositsHeldMad}
          />
        </div>
        <ActivityFeedCard items={activity} />
      </div>
    </>
  )
}
