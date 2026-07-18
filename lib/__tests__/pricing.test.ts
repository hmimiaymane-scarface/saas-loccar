import { describe, expect, it } from "vitest"

import { calculateChargedDays, calculatePricing, paymentStatusFromAmounts } from "../pricing"

describe("calculateChargedDays", () => {
  it("charges a full day for any partial day (e.g. evening pickup, next-morning return)", () => {
    expect(calculateChargedDays("2026-07-20T18:00:00Z", "2026-07-21T10:00:00Z")).toBe(1)
  })

  it("rounds up to the next full day rather than down", () => {
    // 2 days + a few hours -> charged as 3 days
    expect(calculateChargedDays("2026-07-20T10:00:00Z", "2026-07-22T14:00:00Z")).toBe(3)
  })

  it("charges exactly N days for an exact N*24h span", () => {
    expect(calculateChargedDays("2026-07-20T10:00:00Z", "2026-07-23T10:00:00Z")).toBe(3)
  })

  it("enforces a one-day minimum even for a very short rental", () => {
    expect(calculateChargedDays("2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z")).toBe(1)
  })

  it("returns 0 for a non-positive span (return at or before pickup)", () => {
    expect(calculateChargedDays("2026-07-20T10:00:00Z", "2026-07-20T10:00:00Z")).toBe(0)
    expect(calculateChargedDays("2026-07-20T10:00:00Z", "2026-07-19T10:00:00Z")).toBe(0)
  })
})

describe("calculatePricing", () => {
  it("computes base amount, discount and total without floating-point drift", () => {
    // A classic float trap: 0.1 + 0.2 !== 0.3 in plain JS arithmetic.
    const result = calculatePricing({
      dailyRateMad: 333.33,
      pickupAt: "2026-07-20T10:00:00Z",
      returnAt: "2026-07-23T10:00:00Z", // 3 days
      discountMad: 100,
    })
    expect(result.numDays).toBe(3)
    expect(result.baseAmountMad).toBeCloseTo(999.99, 2)
    expect(result.discountMad).toBe(100)
    expect(result.totalMad).toBeCloseTo(899.99, 2)
  })

  it("clamps a discount larger than the base amount to the base amount (never a negative total)", () => {
    const result = calculatePricing({
      dailyRateMad: 200,
      pickupAt: "2026-07-20T10:00:00Z",
      returnAt: "2026-07-21T10:00:00Z", // 1 day, base = 200
      discountMad: 500,
    })
    expect(result.totalMad).toBe(0)
    expect(result.discountMad).toBe(200)
  })

  it("computes remaining balance as total minus amount paid", () => {
    const result = calculatePricing({
      dailyRateMad: 300,
      pickupAt: "2026-07-20T10:00:00Z",
      returnAt: "2026-07-24T10:00:00Z", // 4 days, base = 1200
      amountPaidMad: 500,
    })
    expect(result.totalMad).toBe(1200)
    expect(result.remainingMad).toBe(700)
  })

  it("never lets remaining balance go negative when overpaid", () => {
    const result = calculatePricing({
      dailyRateMad: 300,
      pickupAt: "2026-07-20T10:00:00Z",
      returnAt: "2026-07-21T10:00:00Z",
      amountPaidMad: 1000,
    })
    expect(result.remainingMad).toBe(0)
  })
})

describe("paymentStatusFromAmounts", () => {
  it("is unpaid when nothing has been paid", () => {
    expect(paymentStatusFromAmounts(1000, 0)).toBe("unpaid")
  })
  it("is partial when something but not everything has been paid", () => {
    expect(paymentStatusFromAmounts(1000, 400)).toBe("partial")
  })
  it("is paid once the amount paid reaches the total", () => {
    expect(paymentStatusFromAmounts(1000, 1000)).toBe("paid")
    expect(paymentStatusFromAmounts(1000, 1200)).toBe("paid")
  })
})
