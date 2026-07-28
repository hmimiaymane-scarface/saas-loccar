import type { FleetPerformanceRow } from "@/types/rental"
import type { MonthlyRevenuePoint } from "@/lib/data"
import { formatMad } from "@/lib/format"

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

export type PerformanceHighlightIcon = "topRevenue" | "topRentals" | "topUtilization" | "idle" | "record" | "streak"

export interface PerformanceHighlight {
  icon: PerformanceHighlightIcon
  text: string
}

/** Composes the leaderboard/record/streak results above into the plain
 * sentences `PerformanceHighlightsCard` renders — kept here, not in the
 * component, so the "which highlights qualify and what they say" logic
 * is unit-testable without React. No coins/XP/badges (the brief's own
 * explicit non-goal) — every entry is a short, factual sentence; the
 * component's job is only to pair each with an icon. Deliberately does
 * NOT include a "month vs last month" line — `RevenueIntelligenceCard`
 * already owns that fact on the same page. */
export function buildPerformanceHighlights(
  leaderboard: VehicleLeaderboard,
  record: RevenueRecord,
  streak: RevenueStreak
): PerformanceHighlight[] {
  const highlights: PerformanceHighlight[] = []

  if (leaderboard.topRevenue) {
    highlights.push({
      icon: "topRevenue",
      text: `Top vehicle by revenue this month: ${leaderboard.topRevenue.vehicleLabel} (${leaderboard.topRevenue.plate}) — ${formatMad(leaderboard.topRevenue.value)}.`,
    })
  }

  if (leaderboard.topRentals) {
    highlights.push({
      icon: "topRentals",
      text: `Most rented this month: ${leaderboard.topRentals.vehicleLabel} (${leaderboard.topRentals.plate}) — ${leaderboard.topRentals.value} rental${leaderboard.topRentals.value === 1 ? "" : "s"}.`,
    })
  }

  if (leaderboard.topUtilization) {
    highlights.push({
      icon: "topUtilization",
      text: `Highest utilization: ${leaderboard.topUtilization.vehicleLabel} (${leaderboard.topUtilization.plate}) at ${leaderboard.topUtilization.value}%.`,
    })
  }

  if (record.isRecord) {
    highlights.push({ icon: "record", text: `New revenue record this month: ${formatMad(record.bestRevenueMad)}.` })
  }

  if (streak.length >= 2 && streak.direction) {
    highlights.push({
      icon: "streak",
      text:
        streak.direction === "growth"
          ? `Revenue has grown for ${streak.length} straight months.`
          : `Revenue has declined for ${streak.length} straight months.`,
    })
  }

  if (leaderboard.mostIdle) {
    highlights.push({
      icon: "idle",
      text: `${leaderboard.mostIdle.vehicleLabel} (${leaderboard.mostIdle.plate}) hasn't had a rental in ${leaderboard.mostIdle.idleDaysThisMonth} day${leaderboard.mostIdle.idleDaysThisMonth === 1 ? "" : "s"} this month.`,
    })
  }

  return highlights
}

export interface VehicleRank {
  rank: number
  total: number
}

/** Roadmap phase 32 ("Vehicle Personality Without Gimmicks") — where
 * this one vehicle stands among the whole fleet by revenue this month.
 * The "compete" framing the user asked for, deliberately as real
 * business standing (a rank among real numbers) rather than a game
 * score — no points, no XP, nothing invented that isn't already true of
 * the fleet. `null` when this vehicle has no recorded revenue this
 * month (same "never crown/rank zero activity" rule `buildVehicleLeaderboard`
 * already follows) or isn't present in `rows` at all. Ties share the
 * same rank number (standard competition ranking — a tie for #2 doesn't
 * skip to #4 for the next vehicle down but the one after a group of N
 * tied vehicles is #2+N). */
export function computeVehicleRank(rows: FleetPerformanceRow[], vehicleId: string): VehicleRank | null {
  const activeRows = rows.filter((r) => r.recordedRevenueMad > 0)
  const target = activeRows.find((r) => r.vehicleId === vehicleId)
  if (!target) return null

  const sorted = [...activeRows].sort((a, b) => b.recordedRevenueMad - a.recordedRevenueMad)
  const rank = sorted.findIndex((r) => r.recordedRevenueMad === target.recordedRevenueMad) + 1

  return { rank, total: activeRows.length }
}

/** Composes `computeVehicleRank` + this vehicle's own
 * `computeRevenueRecord`/`computeRevenueStreak` (fed a per-vehicle
 * series via `getTrailingMonthlyRevenue(..., vehicleId)`) into the same
 * plain-sentence shape `buildPerformanceHighlights` uses company-wide —
 * reused, not duplicated. */
export function buildVehicleHighlights(rank: VehicleRank | null, record: RevenueRecord, streak: RevenueStreak): PerformanceHighlight[] {
  const highlights: PerformanceHighlight[] = []

  if (rank) {
    highlights.push({ icon: "topRevenue", text: `#${rank.rank} of ${rank.total} vehicles by revenue this month.` })
  }

  if (record.isRecord) {
    highlights.push({ icon: "record", text: `Best month yet: ${formatMad(record.bestRevenueMad)}.` })
  }

  if (streak.length >= 2 && streak.direction) {
    highlights.push({
      icon: "streak",
      text:
        streak.direction === "growth"
          ? `Revenue growing for ${streak.length} straight months.`
          : `Revenue declining for ${streak.length} straight months.`,
    })
  }

  return highlights
}
