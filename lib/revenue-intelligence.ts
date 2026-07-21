/**
 * Roadmap phase 13 requirement 5 — "don't just show a revenue number
 * — show what changed and why, using real underlying drivers... don't
 * fabricate a plausible-sounding explanation that isn't backed by the
 * numbers." Pure: takes this-period vs. prior-period figures already
 * computed by `lib/data.ts#getFleetPerformanceReport` (its own
 * `occupancyRate`) and `#getReservationPerformanceReport` (its own
 * `averageDurationDays`) — called twice with two different
 * `ReportDateRange`s by the caller, not re-implemented here. A driver
 * is only ever named when its own delta is large enough to plausibly
 * matter; a revenue swing with no named driver just says so, rather
 * than reaching for one anyway.
 */

export interface RevenuePeriodFigures {
  revenueMad: number
  occupancyRate: number
  averageDurationDays: number
}

export interface RevenueDriver {
  label: string
  detail: string
}

export interface RevenueIntelligenceResult {
  changePercent: number
  direction: "up" | "down" | "flat"
  headline: string
  drivers: RevenueDriver[]
}

/** Below this, a revenue move reads as "flat," not a real trend. */
const REVENUE_FLAT_THRESHOLD_PERCENT = 3
/** How many percentage points of occupancy (not percent-of-percent —
 * occupancy is already a 0-100 rate) counts as a real, drivable shift. */
const OCCUPANCY_DRIVER_THRESHOLD_POINTS = 5
const DURATION_DRIVER_THRESHOLD_DAYS = 0.5

function pctChange(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0
  return ((current - prior) / prior) * 100
}

export function computeRevenueIntelligence(current: RevenuePeriodFigures, prior: RevenuePeriodFigures): RevenueIntelligenceResult {
  const changePercent = Math.round(pctChange(current.revenueMad, prior.revenueMad))
  const direction: RevenueIntelligenceResult["direction"] = changePercent > REVENUE_FLAT_THRESHOLD_PERCENT ? "up" : changePercent < -REVENUE_FLAT_THRESHOLD_PERCENT ? "down" : "flat"

  const drivers: RevenueDriver[] = []
  const occupancyDelta = Math.round(current.occupancyRate - prior.occupancyRate)
  if (Math.abs(occupancyDelta) >= OCCUPANCY_DRIVER_THRESHOLD_POINTS) {
    drivers.push({
      label: occupancyDelta > 0 ? "Higher fleet occupancy" : "Lower fleet occupancy",
      detail: `${current.occupancyRate}% occupied this period vs. ${prior.occupancyRate}% prior (${occupancyDelta > 0 ? "+" : ""}${occupancyDelta} points).`,
    })
  }

  const durationDelta = Math.round((current.averageDurationDays - prior.averageDurationDays) * 10) / 10
  if (Math.abs(durationDelta) >= DURATION_DRIVER_THRESHOLD_DAYS) {
    drivers.push({
      label: durationDelta > 0 ? "Longer average rentals" : "Shorter average rentals",
      detail: `${current.averageDurationDays.toFixed(1)} days on average this period vs. ${prior.averageDurationDays.toFixed(1)} prior.`,
    })
  }

  const magnitude = direction === "flat" ? "holding steady" : `${direction} ${Math.abs(changePercent)}%`
  const headline =
    direction === "flat"
      ? "Revenue is holding steady compared to last period."
      : drivers.length > 0
        ? `Revenue ${magnitude}: ${drivers.map((d) => d.label.toLowerCase()).join(", ")}.`
        : `Revenue ${magnitude} — no single obvious driver in occupancy or rental length.`

  return { changePercent, direction, headline, drivers }
}
