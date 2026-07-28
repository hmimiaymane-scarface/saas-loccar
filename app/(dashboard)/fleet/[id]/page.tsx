import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Pencil, Plus, Gauge, MapPin, AlertTriangle, Wrench, Sparkles } from "lucide-react"

import { getSessionContext, type SessionContext } from "@/lib/auth/session"
import {
  getVehicleDetail,
  getVehicleMaintenanceHistory,
  getVehicleEconomics,
  getActivityLogList,
  getFleetPerformanceReport,
  getTrailingMonthlyRevenue,
} from "@/lib/data"
import { formatMad, formatDate, formatDateTime } from "@/lib/format"
import { vehicleStatusConfig, damageStatusConfig, maintenanceRecordStatusConfig, MAINTENANCE_TYPE_LABELS } from "@/lib/status"
import { resolveReportPeriod, type ReportPeriod } from "@/lib/reports"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { getVehicleIntelligence } from "@/lib/vehicle-intelligence-store"
import { computeCostTrend } from "@/lib/vehicle-intelligence"
import {
  GAMIFICATION_TRAILING_MONTHS,
  computeVehicleRank,
  computeRevenueRecord,
  computeRevenueStreak,
  buildVehicleHighlights,
} from "@/lib/gamification"
import { StatusBadge } from "@/components/domain/status-badge"
import { SectionHeader } from "@/components/domain/section-header"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ReservationRow } from "@/components/domain/reservations/reservation-row"
import { VehicleStatusActions } from "@/components/domain/fleet/vehicle-status-actions"
import { DocumentListItem } from "@/components/domain/documents/document-list-item"
import { VehicleEconomicsCard } from "@/components/domain/fleet/vehicle-economics-card"
import { VehicleIntelligenceCard } from "@/components/domain/fleet/vehicle-intelligence-card"
import { VehicleInsightsSection } from "@/components/domain/fleet/vehicle-insights-section"
import { VehicleSnapshotStrip } from "@/components/domain/fleet/vehicle-snapshot-strip"
import { PerformanceHighlightsCard } from "@/components/domain/overview/performance-highlights-card"
import { EntityTimeline } from "@/components/domain/intelligence/entity-timeline"

// Bible Chapter 3 §5 also lists a "Customer Reviews" section — omitted
// here rather than faked: this codebase has no review/rating concept
// anywhere (no field on customers, reservations, or anything else). A
// future phase, not this one.

/** Skipped entirely in mock mode (no createClient() to make) — matches
 * how the rest of this page already behaves via lib/data.ts's
 * isMockMode(). Any other failure (e.g. the vehicle_intelligence
 * migration not yet applied) degrades to "no card" rather than
 * crashing an otherwise-working page — this is presentation of an
 * advisory feature, not core vehicle data. */
async function loadVehicleIntelligence(session: SessionContext, vehicleId: string) {
  if (!isSupabaseConfigured) return null
  try {
    const supabase = await createClient()
    return await getVehicleIntelligence(supabase, session, vehicleId)
  } catch {
    return null
  }
}

function daysUntil(date: string, nowMs: number): number {
  return Math.floor((new Date(date).getTime() - nowMs) / 86400000)
}

function DocumentRow({ label, date, nowMs }: { label: string; date: string | null; nowMs: number }) {
  if (!date) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">Not set</span>
      </div>
    )
  }
  const days = daysUntil(date, nowMs)
  const tone =
    days < 0
      ? "text-red-600 dark:text-red-400"
      : days <= 30
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground"
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone}>
        {formatDate(date)}
        {days < 0 ? " · expired" : days <= 30 ? ` · ${days}d left` : ""}
      </span>
    </div>
  )
}

const VALID_PERIODS: ReportPeriod[] = ["today", "this_week", "this_month", "last_month", "custom"]

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const { id } = await params
  const query = await searchParams
  const period: ReportPeriod = VALID_PERIODS.includes(query.period as ReportPeriod) ? (query.period as ReportPeriod) : "this_month"
  const today = new Date().toISOString().slice(0, 10)
  const range = resolveReportPeriod(period, session.company.timezone, { from: query.from ?? today, to: query.to ?? today })

  // Roadmap phase 32 ("Vehicle Personality Without Gimmicks") — the
  // snapshot strip's "this month" facts are always this_month/last_month
  // specifically, independent of the page's own period selector above
  // (which scopes the separate "Revenue & expenses" card further down).
  const tz = session.company.timezone
  const thisMonth = resolveReportPeriod("this_month", tz)
  const lastMonth = resolveReportPeriod("last_month", tz)

  const [vehicle, maintenanceHistory, economics, intelligence, timeline, economicsThisMonth, economicsLastMonth, fleetPerfThisMonth, vehicleTrailingRevenue] =
    await Promise.all([
      getVehicleDetail(session.company.id, id),
      getVehicleMaintenanceHistory(session.company.id, id),
      getVehicleEconomics(session.company.id, id, range),
      loadVehicleIntelligence(session, id),
      getActivityLogList(session.company.id, { vehicleId: id }, 1, 20),
      getVehicleEconomics(session.company.id, id, thisMonth),
      getVehicleEconomics(session.company.id, id, lastMonth),
      getFleetPerformanceReport(session.company.id, thisMonth),
      getTrailingMonthlyRevenue(session.company.id, GAMIFICATION_TRAILING_MONTHS, tz, id),
    ])
  if (!vehicle) notFound()

  const costTrend = computeCostTrend(economicsThisMonth.recordedExpensesMad, economicsLastMonth.recordedExpensesMad)
  const rank = computeVehicleRank(fleetPerfThisMonth.rows, id)
  const revenueRecord = computeRevenueRecord(vehicleTrailingRevenue)
  const revenueStreak = computeRevenueStreak(vehicleTrailingRevenue)
  const vehicleHighlights = buildVehicleHighlights(rank, revenueRecord, revenueStreak)

  const canManage = session.role === "owner" || session.role === "manager"
  // Server Component rendered fresh per request — "now" here is correct,
  // not a stale memoized value the purity rule is meant to guard against.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()

  return (
    <>
      <SectionHeader
        title={`${vehicle.make} ${vehicle.model}`}
        description={`${vehicle.year} · ${vehicle.plate}${vehicle.branchName ? ` · ${vehicle.branchName}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/reservations/new?vehicleId=${vehicle.id}&rate=${vehicle.dailyRateMad}`}>
                <Plus />
                New reservation
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/damages/new?vehicle=${vehicle.id}`}>
                <AlertTriangle />
                Record damage
              </Link>
            </Button>
            {canManage && (
              <Button variant="outline" asChild>
                <Link href={`/maintenance/new?vehicle=${vehicle.id}`}>
                  <Wrench />
                  Schedule maintenance
                </Link>
              </Button>
            )}
            {canManage && (
              <Button variant="outline" asChild>
                <Link href={`/fleet/${vehicle.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Bible requirement: "an owner should understand a vehicle
          within seconds" — the AI summary leads the page, above
          everything else, not buried inside a card. */}
      {intelligence?.summary && (
        <div className="flex items-center gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-foreground">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" />
          {intelligence.summary}
        </div>
      )}

      {/* Roadmap phase 32 ("Vehicle Personality Without Gimmicks") —
          the "compare two vehicles at a flip" glance strip, ahead of
          the detailed cards below. */}
      <VehicleSnapshotStrip vehicle={vehicle} economics={economicsThisMonth} costTrend={costTrend} intelligence={intelligence} rank={rank} />
      <PerformanceHighlightsCard highlights={vehicleHighlights} title="This vehicle" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Status</CardTitle>
              <StatusBadge visual={vehicleStatusConfig[vehicle.status]} />
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gauge className="size-4" />
                {vehicle.mileageKm.toLocaleString()} km
              </div>
              {vehicle.branchName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="size-4" />
                  {vehicle.branchName}
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                <span className="capitalize">{vehicle.category}</span> · {vehicle.transmission} ·{" "}
                {vehicle.fuelType}
                {vehicle.seats ? ` · ${vehicle.seats} seats` : ""}
                {vehicle.color ? ` · ${vehicle.color}` : ""}
              </div>
              <div className="text-sm font-medium text-foreground">
                {formatMad(vehicle.dailyRateMad)}/day
                {vehicle.depositMad ? ` · ${formatMad(vehicle.depositMad)} deposit` : ""}
              </div>
            </CardContent>
          </Card>

          {intelligence && <VehicleIntelligenceCard intelligence={intelligence} />}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <EntityTimeline items={timeline.items} />
            </CardContent>
          </Card>

          <VehicleEconomicsCard economics={economics} period={period} />

          {vehicle.currentReservation && (
            <Card>
              <CardHeader>
                <CardTitle>Current reservation</CardTitle>
              </CardHeader>
              <CardContent>
                <ReservationRow booking={vehicle.currentReservation} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Upcoming reservations</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {vehicle.upcomingReservations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
              ) : (
                vehicle.upcomingReservations.map((b) => <ReservationRow key={b.id} booking={b} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent rentals</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {vehicle.recentReservations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed rentals yet.</p>
              ) : (
                vehicle.recentReservations.map((b) => <ReservationRow key={b.id} booking={b} />)
              )}
            </CardContent>
          </Card>

          {vehicle.recentInspections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Inspections</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {vehicle.recentInspections.map((inspection) => (
                  <Link
                    key={inspection.id}
                    href={`/inspections/${inspection.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:underline"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground capitalize">{inspection.type} inspection</span>
                      <span className="text-xs text-muted-foreground">
                        {inspection.odometerKm != null ? `${inspection.odometerKm.toLocaleString()} km` : "No odometer"}
                        {inspection.completedAt ? ` · ${formatDateTime(inspection.completedAt)}` : ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{inspection.status}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {maintenanceHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Maintenance</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {maintenanceHistory.map((record) => (
                  <Link
                    key={record.id}
                    href={`/maintenance/${record.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:underline"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{MAINTENANCE_TYPE_LABELS[record.type] ?? record.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {record.scheduledOn ? formatDate(record.scheduledOn) : "No date"}
                        {record.actualCostMad != null ? ` · ${formatMad(record.actualCostMad)}` : ""}
                      </span>
                    </div>
                    <StatusBadge visual={maintenanceRecordStatusConfig[record.status]} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {vehicle.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {vehicle.documents.map((doc) => (
                  <DocumentListItem key={doc.id} document={doc} canDelete={canManage} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <VehicleStatusActions vehicleId={vehicle.id} status={vehicle.status} />
              </CardContent>
            </Card>
          )}

          {intelligence && <VehicleInsightsSection intelligence={intelligence} />}

          {vehicle.openDamages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Open damage</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {vehicle.openDamages.map((damage) => (
                  <Link
                    key={damage.id}
                    href={`/damages/${damage.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:underline"
                  >
                    <div className="flex flex-col">
                      <span className="text-foreground">{damage.vehicleArea}</span>
                      <span className="text-xs text-muted-foreground">{damage.description}</span>
                    </div>
                    <StatusBadge visual={damageStatusConfig[damage.status]} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {vehicle.previousDamages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Damage history</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {vehicle.previousDamages.map((damage) => (
                  <Link
                    key={damage.id}
                    href={`/damages/${damage.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:underline"
                  >
                    <span className="text-foreground">{damage.vehicleArea}</span>
                    <StatusBadge visual={damageStatusConfig[damage.status]} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Insurance &amp; compliance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <DocumentRow label="Insurance" date={vehicle.insuranceExpiresOn} nowMs={nowMs} />
              <Separator />
              <DocumentRow label="Registration" date={vehicle.registrationExpiresOn} nowMs={nowMs} />
              <Separator />
              <DocumentRow label="Inspection" date={vehicle.inspectionExpiresOn} nowMs={nowMs} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
