import { describe, expect, it } from "vitest"

import { computeRevenueIntelligence, computeRevenuePulseHeadline } from "@/lib/revenue-intelligence"

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
    expect(result.hasData).toBe(true)
  })

  it("roadmap phase 53 — reports hasData: false and an honest 'not enough history' headline instead of a fabricated 'holding steady' claim when both periods are exactly zero", () => {
    const result = computeRevenueIntelligence({ revenueMad: 0, occupancyRate: 0, averageDurationDays: 0 }, { revenueMad: 0, occupancyRate: 0, averageDurationDays: 0 })
    expect(result.hasData).toBe(false)
    expect(result.headline).not.toContain("holding steady")
    expect(result.drivers).toEqual([])
  })
})

describe("computeRevenuePulseHeadline", () => {
  it("matches the brief's own example verbatim: up 14%", () => {
    expect(computeRevenuePulseHeadline(114_000, 100_000)).toBe("Strong month: revenue is up 14%.")
  })

  it("phrases a decline as a slower month", () => {
    expect(computeRevenuePulseHeadline(85_000, 100_000)).toBe("Slower month: revenue is down 15%.")
  })

  it("phrases a small move as steady, not up or down", () => {
    expect(computeRevenuePulseHeadline(101_000, 100_000)).toBe("Steady month: revenue is flat compared to last month.")
  })

  it("never names a driver, unlike computeRevenueIntelligence", () => {
    const headline = computeRevenuePulseHeadline(114_000, 100_000)
    expect(headline).not.toBeNull()
    expect(headline?.toLowerCase()).not.toContain("occupancy")
    expect(headline?.toLowerCase()).not.toContain("rental")
  })

  it("handles a zero prior-period revenue without dividing by zero", () => {
    expect(computeRevenuePulseHeadline(5_000, 0)).toBe("Strong month: revenue is up 100%.")
  })

  it("returns null rather than a fabricated 'steady' claim when both periods are zero", () => {
    expect(computeRevenuePulseHeadline(0, 0)).toBeNull()
  })
})
