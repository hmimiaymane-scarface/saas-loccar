import { Wallet, TrendingUp, TrendingDown, Minus, Gauge, HeartPulse, CalendarClock, Trophy } from "lucide-react"

import type { VehicleDetail } from "@/types/rental"
import type { VehicleEconomics } from "@/types/rental"
import type { VehicleIntelligenceResult } from "@/lib/vehicle-intelligence-store"
import type { CostTrendResult } from "@/lib/vehicle-intelligence"
import type { VehicleRank } from "@/lib/gamification"
import { formatDate } from "@/lib/format"
import { StatCard } from "@/components/domain/stat-card"

const COST_TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const
const COST_TREND_TONE = { up: "warning", down: "default", flat: "default" } as const

const HEALTH_TONE: Record<VehicleIntelligenceResult["health"]["band"], "default" | "warning" | "danger"> = {
  excellent: "default",
  good: "default",
  fair: "warning",
  poor: "danger",
}

function nextRentalTile(vehicle: VehicleDetail): { value: string; hint: string } {
  if (vehicle.currentReservation) {
    return { value: `Back ${formatDate(vehicle.currentReservation.endDate)}`, hint: `Out with ${vehicle.currentReservation.customer.fullName}` }
  }
  const next = vehicle.upcomingReservations[0]
  if (next) {
    return { value: formatDate(next.startDate), hint: next.customer.fullName }
  }
  return { value: "None scheduled", hint: "Nothing booked yet" }
}

/**
 * Roadmap phase 32 ("Vehicle Personality Without Gimmicks") — one
 * compact, glanceable strip at the top of the vehicle page, so an
 * owner can compare two vehicles' pages at a flip rather than scroll
 * through 6+ separate cards. Reuses `StatCard`, the exact "two or three
 * numbers an owner actually opens the app to check" primitive
 * `HomeSummaryStrip` already established on `/overview` — same visual
 * language at every zoom level. Each tile degrades independently:
 * revenue/cost-trend/next-rental/rank always render (they come from
 * data this page always has), utilization/health only render when
 * `intelligence` exists — same gating every other intelligence element
 * on this page already uses, not a new rule.
 */
function VehicleSnapshotStrip({
  vehicle,
  economics,
  costTrend,
  intelligence,
  rank,
}: {
  vehicle: VehicleDetail
  economics: VehicleEconomics
  costTrend: CostTrendResult
  intelligence: VehicleIntelligenceResult | null
  rank: VehicleRank | null
}) {
  const CostIcon = COST_TREND_ICON[costTrend.direction]
  const costValue = costTrend.direction === "flat" ? "Flat" : `${costTrend.changePercent > 0 ? "+" : ""}${costTrend.changePercent}%`
  const next = nextRentalTile(vehicle)

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Revenue this month"
        value={String(economics.recordedRevenueMad)}
        numericValue={economics.recordedRevenueMad}
        formatter="mad"
        icon={Wallet}
      />
      <StatCard label="Cost trend" value={costValue} icon={CostIcon} tone={COST_TREND_TONE[costTrend.direction]} hint="vs last month" />
      <StatCard label="Next rental" value={next.value} icon={CalendarClock} hint={next.hint} />
      {rank && <StatCard label="Fleet rank" value={`#${rank.rank}`} icon={Trophy} hint={`of ${rank.total} vehicles by revenue`} />}
      {intelligence && (
        <StatCard label="Utilization" value={`${intelligence.utilization.occupancyRatePercent}%`} icon={Gauge} hint={`${intelligence.utilization.idleDays} idle days`} />
      )}
      {intelligence && (
        <StatCard
          label="Health"
          value={String(intelligence.health.score)}
          icon={HeartPulse}
          tone={HEALTH_TONE[intelligence.health.band]}
          hint={intelligence.health.band}
        />
      )}
    </div>
  )
}

export { VehicleSnapshotStrip }
