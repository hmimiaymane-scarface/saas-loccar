import type { FleetPerformanceRow } from "@/types/rental"
import type { MonthlyRevenuePoint } from "@/lib/data"

/**
 * Roadmap phase 31 ("Business Gamification Layer") — pure derivations
 * over data already fetched by the Overview page (`FleetPerformanceRow[]`
 * from `getFleetPerformanceReport`, a monthly series from
 * `getTrailingMonthlyRevenue`). No Supabase dependency, hand-fixture
 * tested, same shape as `lib/revenue-intelligence.ts`/`lib/business-pulse.ts`.
 *
 * Every "top"/"record"/"streak" claim below only fires when the
 * underlying data actually supports it — a vehicle with zero revenue is
 * never crowned "top revenue," a company with one month of history
 * never gets told it just hit a "record." Matches this codebase's
 * consistent "don't fabricate a plausible-sounding claim the numbers
 * don't back" convention (see `lib/revenue-intelligence.ts`'s own
 * doc comment).
 */

/** How many trailing calendar months "personal best"/"revenue streak"
 * look back across. A full year — long enough for "record" to mean
 * something, short enough to stay one bounded query. */
export const GAMIFICATION_TRAILING_MONTHS = 12

export interface LeaderboardEntry {
  vehicleId: string
  vehicleLabel: string
  plate: string
  value: number
}

export interface IdleVehicleEntry {
  vehicleId: string
  vehicleLabel: string
  plate: string
  /** Days without a rental so far this calendar month — NOT a
   * cross-period "last activity" figure (that's the Operations Feed's
   * `evaluateIdleVehicle`, a deliberately different, actionable-alert
   * definition). This one is scoped to "this month" on purpose, worded
   * accordingly by the caller, so it never implies more precision than
   * it has. */
  idleDaysThisMonth: number
}

export interface VehicleLeaderboard {
  topRevenue: LeaderboardEntry | null
  topRentals: LeaderboardEntry | null
  topUtilization: LeaderboardEntry | null
  mostIdle: IdleVehicleEntry | null
}

function topBy(rows: FleetPerformanceRow[], value: (r: FleetPerformanceRow) => number): LeaderboardEntry | null {
  let best: FleetPerformanceRow | null = null
  let bestValue = 0
  for (const row of rows) {
    const v = value(row)
    if (v > bestValue) {
      best = row
      bestValue = v
    }
  }
  return best ? { vehicleId: best.vehicleId, vehicleLabel: best.vehicleLabel, plate: best.plate, value: bestValue } : null
}

/** `periodDays` is the same figure `getFleetPerformanceReport`'s own
 * caller already computes (the report's date range in days) — passed
 * in rather than re-derived, so utilization can never silently disagree
 * with the occupancy-rate math elsewhere on the page. */
export function buildVehicleLeaderboard(rows: FleetPerformanceRow[], periodDays: number): VehicleLeaderboard {
  const topRevenue = topBy(rows, (r) => r.recordedRevenueMad)
  const topRentals = topBy(rows, (r) => r.reservationCount)
  const topUtilization =
    periodDays > 0 ? topBy(rows, (r) => Math.round((r.rentalDays / periodDays) * 100)) : null

  const idleRows = rows.filter((r) => r.rentalDays === 0 && r.downtimeDays > 0)
  let mostIdle: IdleVehicleEntry | null = null
  let mostIdleDays = 0
  for (const row of idleRows) {
    if (row.downtimeDays > mostIdleDays) {
      mostIdle = { vehicleId: row.vehicleId, vehicleLabel: row.vehicleLabel, plate: row.plate, idleDaysThisMonth: row.downtimeDays }
      mostIdleDays = row.downtimeDays
    }
  }

  return { topRevenue, topRentals, topUtilization, mostIdle }
}

export interface RevenueRecord {
  isRecord: boolean
  bestRevenueMad: number
}

/** A "record" only ever means "at least as good as the best PRIOR
 * month" — a series with nothing before the current month has nothing
 * to be a record against, so it's never reported as one. */
export function computeRevenueRecord(series: MonthlyRevenuePoint[]): RevenueRecord {
  if (series.length < 2) return { isRecord: false, bestRevenueMad: series[0]?.revenueMad ?? 0 }

  const current = series[series.length - 1]
  const priorMonths = series.slice(0, -1)
  const bestPrior = Math.max(...priorMonths.map((m) => m.revenueMad))

  return {
    isRecord: current.revenueMad > 0 && current.revenueMad >= bestPrior,
    bestRevenueMad: Math.max(current.revenueMad, bestPrior),
  }
}

export interface RevenueStreak {
  length: number
  direction: "growth" | "decline" | null
}

/** Consecutive months, walking backward from the most recent, each
 * strictly greater (or strictly less) than the one before it. A flat
 * month (equal revenue) breaks a streak either way rather than
 * ambiguously extending it. Only ever reported when `length >= 2` — one
 * month on its own is not a streak. */
export function computeRevenueStreak(series: MonthlyRevenuePoint[]): RevenueStreak {
  let length = 0
  let direction: "growth" | "decline" | null = null

  for (let i = series.length - 1; i > 0; i--) {
    const isGrowthStep = series[i].revenueMad > series[i - 1].revenueMad
    const isDeclineStep = series[i].revenueMad < series[i - 1].revenueMad

    if (direction === null) {
      if (!isGrowthStep && !isDeclineStep) break // a flat transition never starts a streak
      direction = isGrowthStep ? "growth" : "decline"
      length = 1
      continue
    }

    const matchesDirection = direction === "growth" ? isGrowthStep : isDeclineStep
    if (!matchesDirection) break
    length++
  }

  return length >= 2 ? { length, direction } : { length: 0, direction: null }
}
