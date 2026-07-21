import { describe, expect, it } from "vitest"

import {
  computeVehicleHealth,
  bandForScore,
  computeVehicleProfitability,
  computeVehicleUtilization,
  splitWeekdayWeekend,
  HEALTH_FACTOR_WEIGHTS,
  type VehicleHealthInput,
} from "@/lib/vehicle-intelligence"

describe("HEALTH_FACTOR_WEIGHTS", () => {
  it("sums to exactly 100 so the weighted average is a true percentage", () => {
    const total = Object.values(HEALTH_FACTOR_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
  })
})

describe("bandForScore", () => {
  it("maps score boundaries to the right band", () => {
    expect(bandForScore(85)).toBe("excellent")
    expect(bandForScore(84)).toBe("good")
    expect(bandForScore(65)).toBe("good")
    expect(bandForScore(64)).toBe("fair")
    expect(bandForScore(40)).toBe("fair")
    expect(bandForScore(39)).toBe("poor")
    expect(bandForScore(0)).toBe("poor")
    expect(bandForScore(100)).toBe("excellent")
  })
})

describe("computeVehicleHealth", () => {
  const now = new Date("2026-07-27T00:00:00.000Z")

  it("scores a well-maintained, compliant, low-mileage vehicle as excellent (hand-computed)", () => {
    const input: VehicleHealthInput = {
      ageYears: 1,
      mileageKm: 10_000,
      maintenanceRecords: [],
      damages: [],
      inspections: [{ overallCondition: "excellent", cleanliness: "clean" }],
      insuranceExpiresOn: "2027-07-27",
      registrationExpiresOn: "2027-07-27",
      inspectionExpiresOn: "2027-07-27",
      downtimeDays: 0,
      totalDays: 100,
      now,
    }

    const result = computeVehicleHealth(input)

    // damage=100*25 + maintenance=100*20 + inspection=100*20 + compliance=100*15
    // + ageMileage=94*15 + downtime=100*5, /100 = 99.1 -> 99
    expect(result.score).toBe(99)
    expect(result.band).toBe("excellent")
    expect(result.factors).toHaveLength(6)
    expect(result.factors.find((f) => f.key === "age_mileage")?.score).toBe(94)
  })

  it("scores a damaged, overdue, non-compliant vehicle as fair (hand-computed)", () => {
    const input: VehicleHealthInput = {
      ageYears: 10,
      mileageKm: 180_000,
      maintenanceRecords: [{ status: "scheduled", scheduledOn: "2020-01-01" }],
      damages: [{ status: "newly_discovered", severity: "severe", preExisting: false }],
      inspections: [{ overallCondition: "poor", cleanliness: "dirty" }],
      insuranceExpiresOn: "2026-01-01",
      registrationExpiresOn: null,
      inspectionExpiresOn: null,
      downtimeDays: 50,
      totalDays: 100,
      now,
    }

    const result = computeVehicleHealth(input)

    // damage=70*25 + maintenance=80*20 + inspection=20*20 + compliance=0*15
    // + ageMileage=15*15 + downtime=50*5, /100 = 42.25 -> 42
    expect(result.score).toBe(42)
    expect(result.band).toBe("fair")
    expect(result.factors.find((f) => f.key === "damage")?.score).toBe(70)
    expect(result.factors.find((f) => f.key === "compliance")?.score).toBe(0)
  })

  it("does not penalize a pre-existing damage", () => {
    const base: VehicleHealthInput = {
      ageYears: 1,
      mileageKm: 10_000,
      maintenanceRecords: [],
      damages: [],
      inspections: [],
      insuranceExpiresOn: null,
      registrationExpiresOn: null,
      inspectionExpiresOn: null,
      downtimeDays: 0,
      totalDays: 100,
      now,
    }

    const withPreExisting = computeVehicleHealth({
      ...base,
      damages: [{ status: "existing", severity: "severe", preExisting: true }],
    })

    expect(withPreExisting.factors.find((f) => f.key === "damage")?.score).toBe(100)
  })

  it("weights an unresolved damage at full severity and a resolved one at half", () => {
    const base: VehicleHealthInput = {
      ageYears: 1,
      mileageKm: 10_000,
      maintenanceRecords: [],
      damages: [],
      inspections: [],
      insuranceExpiresOn: null,
      registrationExpiresOn: null,
      inspectionExpiresOn: null,
      downtimeDays: 0,
      totalDays: 100,
      now,
    }

    const open = computeVehicleHealth({
      ...base,
      damages: [{ status: "under_review", severity: "moderate", preExisting: false }],
    })
    const resolved = computeVehicleHealth({
      ...base,
      damages: [{ status: "repaired", severity: "moderate", preExisting: false }],
    })

    expect(open.factors.find((f) => f.key === "damage")?.score).toBe(85) // 100 - 15
    expect(resolved.factors.find((f) => f.key === "damage")?.score).toBe(92.5) // 100 - 7.5
  })

  it("defaults inspection score to a neutral 70 with no inspection history", () => {
    const result = computeVehicleHealth({
      ageYears: 1,
      mileageKm: 10_000,
      maintenanceRecords: [],
      damages: [],
      inspections: [],
      insuranceExpiresOn: null,
      registrationExpiresOn: null,
      inspectionExpiresOn: null,
      downtimeDays: 0,
      totalDays: 100,
      now,
    })

    expect(result.factors.find((f) => f.key === "inspection")?.score).toBe(70)
  })

  it("treats a compliance date exactly 30 days out as 'expiring soon' and 31 days out as valid", () => {
    const base: VehicleHealthInput = {
      ageYears: 1,
      mileageKm: 10_000,
      maintenanceRecords: [],
      damages: [],
      inspections: [],
      insuranceExpiresOn: null,
      registrationExpiresOn: null,
      inspectionExpiresOn: null,
      downtimeDays: 0,
      totalDays: 100,
      now,
    }

    const exactly30 = computeVehicleHealth({ ...base, insuranceExpiresOn: "2026-08-26" })
    const exactly31 = computeVehicleHealth({ ...base, insuranceExpiresOn: "2026-08-27" })

    expect(exactly30.factors.find((f) => f.key === "compliance")?.score).toBe(50)
    expect(exactly31.factors.find((f) => f.key === "compliance")?.score).toBe(100)
  })
})

describe("computeVehicleProfitability", () => {
  it("computes net and a breakdown that sums to it (hand-computed)", () => {
    const result = computeVehicleProfitability({
      rentalIncomeMad: 10_000,
      maintenanceCostMad: 1_500,
      damageCostMad: 800,
      insuranceCostMad: 1_200,
      cleaningCostMad: 300,
      otherExpensesMad: 200,
      downtimeCostMad: 500,
    })

    expect(result.netMad).toBe(5_500)
    expect(result.breakdown).toEqual([
      { label: "Rental income", amountMad: 10_000, direction: "in" },
      { label: "Maintenance", amountMad: 1_500, direction: "out" },
      { label: "Damage repairs", amountMad: 800, direction: "out" },
      { label: "Insurance", amountMad: 1_200, direction: "out" },
      { label: "Cleaning", amountMad: 300, direction: "out" },
      { label: "Other recorded expenses", amountMad: 200, direction: "out" },
      { label: "Estimated downtime cost", amountMad: 500, direction: "out", isEstimate: true },
    ])
  })

  it("allows a negative net result for an unprofitable vehicle", () => {
    const result = computeVehicleProfitability({
      rentalIncomeMad: 1_000,
      maintenanceCostMad: 2_000,
      damageCostMad: 0,
      insuranceCostMad: 0,
      cleaningCostMad: 0,
      otherExpensesMad: 0,
      downtimeCostMad: 0,
    })
    expect(result.netMad).toBe(-1_000)
  })
})

describe("computeVehicleUtilization", () => {
  it("computes occupancy, idle days, and revenue per day (hand-computed)", () => {
    const result = computeVehicleUtilization({
      rentedDays: 60,
      totalDaysTracked: 100,
      reservationCount: 8,
      revenueMad: 12_000,
    })

    expect(result.occupancyRatePercent).toBe(60)
    expect(result.idleDays).toBe(40)
    expect(result.reservationCount).toBe(8)
    expect(result.revenuePerDayMad).toBe(200)
    expect(result.weekdayVsWeekend).toBeNull()
  })

  it("returns 0 revenue-per-day rather than dividing by zero when never rented", () => {
    const result = computeVehicleUtilization({
      rentedDays: 0,
      totalDaysTracked: 30,
      reservationCount: 0,
      revenueMad: 0,
    })
    expect(result.revenuePerDayMad).toBe(0)
    expect(result.occupancyRatePercent).toBe(0)
  })

  it("passes through a supplied weekday/weekend split", () => {
    const result = computeVehicleUtilization({
      rentedDays: 10,
      totalDaysTracked: 20,
      reservationCount: 2,
      revenueMad: 2_000,
      weekdayVsWeekend: { weekdayDays: 7, weekendDays: 3 },
    })
    expect(result.weekdayVsWeekend).toEqual({ weekdayDays: 7, weekendDays: 3 })
  })
})

describe("splitWeekdayWeekend", () => {
  it("splits one full week (Mon-Sun) as 5 weekdays and 2 weekend days", () => {
    // 2024-01-01 is a Monday (well-known anchor date).
    const result = splitWeekdayWeekend([{ startIso: "2024-01-01T00:00:00.000Z", endIso: "2024-01-08T00:00:00.000Z" }])
    expect(result).toEqual({ weekdayDays: 5, weekendDays: 2 })
  })

  it("counts a Sat-Sun-only range as pure weekend", () => {
    const result = splitWeekdayWeekend([{ startIso: "2024-01-06T00:00:00.000Z", endIso: "2024-01-08T00:00:00.000Z" }])
    expect(result).toEqual({ weekdayDays: 0, weekendDays: 2 })
  })

  it("aggregates across multiple ranges", () => {
    const result = splitWeekdayWeekend([
      { startIso: "2024-01-01T00:00:00.000Z", endIso: "2024-01-08T00:00:00.000Z" }, // 5 weekday, 2 weekend
      { startIso: "2024-01-06T00:00:00.000Z", endIso: "2024-01-08T00:00:00.000Z" }, // 0 weekday, 2 weekend
    ])
    expect(result).toEqual({ weekdayDays: 5, weekendDays: 4 })
  })

  it("returns zero counts for an empty input", () => {
    expect(splitWeekdayWeekend([])).toEqual({ weekdayDays: 0, weekendDays: 0 })
  })
})
