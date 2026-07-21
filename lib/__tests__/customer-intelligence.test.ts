import { describe, expect, it } from "vitest"

import {
  computeTrustScore,
  computeCustomerLifetimeValue,
  TRUST_FACTOR_WEIGHTS,
  type TrustScoreInput,
} from "@/lib/customer-intelligence"

describe("TRUST_FACTOR_WEIGHTS", () => {
  it("sums to exactly 100 so the weighted average is a true percentage", () => {
    const total = Object.values(TRUST_FACTOR_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
  })
})

describe("computeTrustScore", () => {
  it("scores a solid but imperfect history as excellent (hand-computed)", () => {
    const input: TrustScoreInput = {
      hasVerifiedIdentity: true,
      successfulRentalsCount: 3,
      lateReturnsCount: 1,
      completedReservationsCount: 4,
      damagesCausedCount: 1,
      outstandingBalanceIncidentsCount: 0,
      depositIssuesCount: 0,
    }

    const result = computeTrustScore(input)

    // identity=100*20 + rentalHistory=60*20 + lateReturns=75*15
    // + damage=80*15 + payment=100*15 + deposit=100*15, /100 = 85.25 -> 85
    expect(result.score).toBe(85)
    expect(result.band).toBe("excellent")
    expect(result.factors).toHaveLength(6)
    expect(result.factors.find((f) => f.key === "rental_history")?.score).toBe(60)
    expect(result.factors.find((f) => f.key === "late_returns")?.score).toBe(75)
  })

  it("scores an unverified, disputed, late-returning customer as poor (hand-computed)", () => {
    const input: TrustScoreInput = {
      hasVerifiedIdentity: false,
      successfulRentalsCount: 0,
      lateReturnsCount: 2,
      completedReservationsCount: 2,
      damagesCausedCount: 2,
      outstandingBalanceIncidentsCount: 2,
      depositIssuesCount: 1,
    }

    const result = computeTrustScore(input)

    // identity=40*20 + rentalHistory=0*20 + lateReturns=0*15
    // + damage=60*15 + payment=50*15 + deposit=70*15, /100 = 35.0
    expect(result.score).toBe(35)
    expect(result.band).toBe("poor")
  })

  it("treats a brand-new customer with no completed rentals as neutral on on-time returns, not penalized", () => {
    const result = computeTrustScore({
      hasVerifiedIdentity: true,
      successfulRentalsCount: 0,
      lateReturnsCount: 0,
      completedReservationsCount: 0,
      damagesCausedCount: 0,
      outstandingBalanceIncidentsCount: 0,
      depositIssuesCount: 0,
    })

    expect(result.factors.find((f) => f.key === "late_returns")?.score).toBe(100)
  })

  it("caps rental-history and floors damage/payment/deposit scores rather than going out of range", () => {
    const result = computeTrustScore({
      hasVerifiedIdentity: true,
      successfulRentalsCount: 10, // would be 200 uncapped
      lateReturnsCount: 0,
      completedReservationsCount: 10,
      damagesCausedCount: 10, // would be -100 unfloored
      outstandingBalanceIncidentsCount: 10,
      depositIssuesCount: 10,
    })

    expect(result.factors.find((f) => f.key === "rental_history")?.score).toBe(100)
    expect(result.factors.find((f) => f.key === "damage_frequency")?.score).toBe(0)
    expect(result.factors.find((f) => f.key === "payment_reliability")?.score).toBe(0)
    expect(result.factors.find((f) => f.key === "deposit_history")?.score).toBe(0)
  })
})

describe("computeCustomerLifetimeValue", () => {
  it("computes frequency, average, and projected future value (hand-computed)", () => {
    const result = computeCustomerLifetimeValue({
      lifetimeRevenueMad: 15_000,
      reservationCount: 5,
      tenureMonths: 10,
      preferredCategory: "suv",
    })

    // frequency = 5 / (10/12) = 6.0; average = 15000/5 = 3000;
    // expected future value = 3000 * 6.0 = 18000
    expect(result.rentalFrequencyPerYear).toBe(6)
    expect(result.averageReservationMad).toBe(3000)
    expect(result.expectedFutureValueMad).toBe(18_000)
    expect(result.preferredCategory).toBe("suv")
  })

  it("returns zeros rather than dividing by zero for a customer with no reservations or tenure", () => {
    const result = computeCustomerLifetimeValue({
      lifetimeRevenueMad: 0,
      reservationCount: 0,
      tenureMonths: 0,
      preferredCategory: null,
    })

    expect(result.rentalFrequencyPerYear).toBe(0)
    expect(result.averageReservationMad).toBe(0)
    expect(result.expectedFutureValueMad).toBe(0)
  })
})
