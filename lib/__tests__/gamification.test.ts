import { describe, expect, it } from "vitest"

import {
  buildVehicleLeaderboard,
  computeRevenueRecord,
  computeRevenueStreak,
} from "@/lib/gamification"
import type { FleetPerformanceRow } from "@/types/rental"
import type { MonthlyRevenuePoint } from "@/lib/data"

function makeRow(overrides: Partial<FleetPerformanceRow> = {}): FleetPerformanceRow {
  return {
    vehicleId: "veh_1",
    vehicleLabel: "Dacia Duster",
    plate: "1234-A-5",
    status: "available",
    rentalDays: 0,
    recordedRevenueMad: 0,
    recordedExpensesMad: 0,
    maintenanceCostMad: 0,
    downtimeDays: 0,
    reservationCount: 0,
    ...overrides,
  }
}

function series(...revenues: number[]): MonthlyRevenuePoint[] {
  return revenues.map((revenueMad, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, revenueMad }))
}

describe("buildVehicleLeaderboard", () => {
  it("picks the top vehicle by revenue, rentals, and utilization independently", () => {
    const rows = [
      makeRow({ vehicleId: "veh_1", recordedRevenueMad: 5000, reservationCount: 2, rentalDays: 10 }),
      makeRow({ vehicleId: "veh_2", vehicleLabel: "Renault Clio", recordedRevenueMad: 3000, reservationCount: 6, rentalDays: 25 }),
    ]
    const board = buildVehicleLeaderboard(rows, 30)
    expect(board.topRevenue?.vehicleId).toBe("veh_1")
    expect(board.topRentals?.vehicleId).toBe("veh_2")
    expect(board.topUtilization?.vehicleId).toBe("veh_2")
  })

  it("never crowns a vehicle with zero activity", () => {
    const rows = [makeRow({ recordedRevenueMad: 0, reservationCount: 0, rentalDays: 0 })]
    const board = buildVehicleLeaderboard(rows, 30)
    expect(board.topRevenue).toBeNull()
    expect(board.topRentals).toBeNull()
    expect(board.topUtilization).toBeNull()
  })

  it("returns all nulls for an empty fleet", () => {
    const board = buildVehicleLeaderboard([], 30)
    expect(board).toEqual({ topRevenue: null, topRentals: null, topUtilization: null, mostIdle: null })
  })

  it("surfaces the most-idle vehicle, ignoring ones that had any rental at all", () => {
    const rows = [
      makeRow({ vehicleId: "veh_1", rentalDays: 0, downtimeDays: 20 }),
      makeRow({ vehicleId: "veh_2", rentalDays: 0, downtimeDays: 30 }),
      makeRow({ vehicleId: "veh_3", rentalDays: 5, downtimeDays: 25 }),
    ]
    const board = buildVehicleLeaderboard(rows, 30)
    expect(board.mostIdle?.vehicleId).toBe("veh_2")
    expect(board.mostIdle?.idleDaysThisMonth).toBe(30)
  })

  it("reports no idle vehicle when every vehicle had at least one rental", () => {
    const rows = [makeRow({ rentalDays: 3, downtimeDays: 27 })]
    expect(buildVehicleLeaderboard(rows, 30).mostIdle).toBeNull()
  })
})

describe("computeRevenueRecord", () => {
  it("is never a record with fewer than two months of data", () => {
    expect(computeRevenueRecord(series(5000))).toEqual({ isRecord: false, bestRevenueMad: 5000 })
    expect(computeRevenueRecord([])).toEqual({ isRecord: false, bestRevenueMad: 0 })
  })

  it("is a record when the current month matches or beats every prior month", () => {
    expect(computeRevenueRecord(series(3000, 4000, 4500)).isRecord).toBe(true)
    expect(computeRevenueRecord(series(3000, 4000, 4000)).isRecord).toBe(true) // ties the best
  })

  it("is not a record when a prior month was higher", () => {
    expect(computeRevenueRecord(series(3000, 5000, 4000)).isRecord).toBe(false)
  })

  it("is never a record when the current month is zero", () => {
    expect(computeRevenueRecord(series(3000, 4000, 0)).isRecord).toBe(false)
  })

  it("reports the best-ever figure regardless of which month it was", () => {
    expect(computeRevenueRecord(series(3000, 5000, 4000)).bestRevenueMad).toBe(5000)
  })
})

describe("computeRevenueStreak", () => {
  it("reports no streak for fewer than two months", () => {
    expect(computeRevenueStreak(series(5000))).toEqual({ length: 0, direction: null })
    expect(computeRevenueStreak([])).toEqual({ length: 0, direction: null })
  })

  it("counts a genuine growth run correctly (3 consecutive increases)", () => {
    expect(computeRevenueStreak(series(100, 110, 125, 150))).toEqual({ length: 3, direction: "growth" })
  })

  it("counts a genuine decline run correctly (2 consecutive decreases)", () => {
    expect(computeRevenueStreak(series(100, 90, 80))).toEqual({ length: 2, direction: "decline" })
  })

  it("does not report a single-month move as a streak", () => {
    expect(computeRevenueStreak(series(100, 150, 120))).toEqual({ length: 0, direction: null })
  })

  it("a flat transition breaks the streak immediately", () => {
    expect(computeRevenueStreak(series(100, 150, 150))).toEqual({ length: 0, direction: null })
  })

  it("stops counting the instant the direction breaks", () => {
    // most recent 3 transitions: 100->90 (decline), 90->95 (growth) breaks it
    expect(computeRevenueStreak(series(80, 90, 95, 100, 90))).toEqual({ length: 0, direction: null })
  })
})
