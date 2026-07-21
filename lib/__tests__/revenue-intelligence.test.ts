import { describe, expect, it } from "vitest"

import { computeRevenueIntelligence } from "@/lib/revenue-intelligence"

describe("computeRevenueIntelligence", () => {
  it("matches the bible's own worked example: up 12%, higher occupancy + longer rentals", () => {
    const result = computeRevenueIntelligence(
      { revenueMad: 112_000, occupancyRate: 78, averageDurationDays: 4.5 },
      { revenueMad: 100_000, occupancyRate: 68, averageDurationDays: 3.8 }
    )
    expect(result.direction).toBe("up")
    expect(result.changePercent).toBe(12)
    expect(result.drivers.map((d) => d.label)).toEqual(["Higher fleet occupancy", "Longer average rentals"])
    expect(result.headline).toContain("higher fleet occupancy")
    expect(result.headline).toContain("longer average rentals")
  })

  it("never names a driver whose own delta is too small to plausibly explain anything", () => {
    const result = computeRevenueIntelligence(
      { revenueMad: 112_000, occupancyRate: 69, averageDurationDays: 3.9 }, // occupancy +1pt, duration +0.1d — both below threshold
      { revenueMad: 100_000, occupancyRate: 68, averageDurationDays: 3.8 }
    )
    expect(result.direction).toBe("up")
    expect(result.drivers).toEqual([])
    expect(result.headline).toContain("no single obvious driver")
  })

  it("is flat within the 3% band, even with real underlying data", () => {
    const result = computeRevenueIntelligence({ revenueMad: 101_500, occupancyRate: 70, averageDurationDays: 4 }, { revenueMad: 100_000, occupancyRate: 68, averageDurationDays: 3.8 })
    expect(result.direction).toBe("flat")
    expect(result.headline).toBe("Revenue is holding steady compared to last period.")
  })

  it("reports a decline with lower-occupancy / shorter-rental drivers, never a positive-sounding spin", () => {
    const result = computeRevenueIntelligence({ revenueMad: 80_000, occupancyRate: 55, averageDurationDays: 3.0 }, { revenueMad: 100_000, occupancyRate: 68, averageDurationDays: 3.8 })
    expect(result.direction).toBe("down")
    expect(result.changePercent).toBe(-20)
    expect(result.drivers.map((d) => d.label)).toEqual(["Lower fleet occupancy", "Shorter average rentals"])
  })

  it("handles a zero prior-period revenue without dividing by zero", () => {
    const result = computeRevenueIntelligence({ revenueMad: 5_000, occupancyRate: 40, averageDurationDays: 3 }, { revenueMad: 0, occupancyRate: 0, averageDurationDays: 0 })
    expect(result.direction).toBe("up")
    expect(result.changePercent).toBe(100)
  })
})
