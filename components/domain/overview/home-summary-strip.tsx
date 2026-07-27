import { CheckCircle2, Car, Undo2 } from "lucide-react"

import type { OverviewMetrics } from "@/types/rental"
import { StatCard } from "@/components/domain/stat-card"

/**
 * Productization wave 1 phase 11 — the Home screen's top summary,
 * "before showing analytics." Reuses `getOverviewMetrics()`'s
 * already-fetched `fleetAvailable`/`fleetRented`/`todayReturnsCount`
 * (no new query) and `StatCard`, the same hero-metric primitive the
 * page already uses for Revenue/Outstanding balance further down —
 * the Available/Rented icons match `lib/status.ts#vehicleStatusConfig`
 * exactly, so the same color language applies at every zoom level.
 */
function HomeSummaryStrip({ metrics }: { metrics: OverviewMetrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        label="Available"
        value={String(metrics.fleetAvailable)}
        numericValue={metrics.fleetAvailable}
        formatter="integer"
        icon={CheckCircle2}
        hint={`of ${metrics.fleetTotal} vehicles`}
      />
      <StatCard
        label="Rented"
        value={String(metrics.fleetRented)}
        numericValue={metrics.fleetRented}
        formatter="integer"
        icon={Car}
        hint={`${metrics.occupancyRate}% occupancy`}
      />
      <StatCard
        label="Returning today"
        value={String(metrics.todayReturnsCount)}
        numericValue={metrics.todayReturnsCount}
        formatter="integer"
        icon={Undo2}
        hint={`${metrics.todayPickupsCount} pickups today`}
      />
    </div>
  )
}

export { HomeSummaryStrip }
