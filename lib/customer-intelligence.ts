import type { VehicleCategory } from "@/types/rental"

/**
 * Pure customer scoring (roadmap phase 08 — the bible's Pillar Two,
 * "Customer Intelligence"; Ch. 5 §13-17). No Supabase dependency, same
 * pure-first split as lib/vehicle-intelligence.ts (phase 06) — every
 * formula here is unit-testable against hand-computed fixtures. The
 * DB-facing side that gathers real data and calls these is
 * lib/customer-intelligence-store.ts.
 *
 * The bible lists seven trust factors: document verification status,
 * successful rentals, late returns, damage frequency, payment
 * reliability, deposit history, previous disputes. This codebase has a
 * real data source for six of them — "previous disputes" is
 * approximated via disputed/retained deposits (the only dispute-shaped
 * signal that exists; there's no separate complaints/disputes table).
 * "Communication" reliability (mentioned in Ch. 5 §14 as a softer
 * signal) has no data source anywhere — not computed, not guessed at.
 * See docs/customer-intelligence.md.
 */

// ---------------------------------------------------------------------
// Trust score
// ---------------------------------------------------------------------

export type TrustBand = "excellent" | "good" | "fair" | "poor"

export interface TrustFactor {
  key: string
  label: string
  /** 0-100, already normalized — not yet weighted. */
  score: number
  /** Out of 100, all factor weights sum to 100. */
  weight: number
  note?: string
}

export interface TrustScoreResult {
  score: number
  band: TrustBand
  factors: TrustFactor[]
}

export interface TrustScoreInput {
  /** Has at least one active identity_document or driving_licence
   * document on file — see lib/customer-intelligence-store.ts for how
   * this is derived from the documents table. */
  hasVerifiedIdentity: boolean
  successfulRentalsCount: number
  lateReturnsCount: number
  completedReservationsCount: number
  /** Damages the customer caused (not pre-existing) across their
   * reservations. */
  damagesCausedCount: number
  /** Completed reservations that still had a remaining balance at
   * completion — the closest available proxy for "payment
   * reliability" without a dedicated due-date/on-time concept. */
  outstandingBalanceIncidentsCount: number
  /** Deposits with status 'disputed' or a nonzero retained amount,
   * across the customer's reservations — approximates "previous
   * disputes" (see module doc comment). */
  depositIssuesCount: number
}

/** Weights sum to 100 — documented here once so the breakdown UI and
 * this module can't drift apart. Identity verification and rental
 * history carry the most weight (the strongest, most direct signals
 * available); the others are real but comparatively softer proxies. */
export const TRUST_FACTOR_WEIGHTS = {
  identityVerification: 20,
  rentalHistory: 20,
  lateReturns: 15,
  damageFrequency: 15,
  paymentReliability: 15,
  depositHistory: 15,
} as const

function bandForTrustScore(score: number): TrustBand {
  if (score >= 85) return "excellent"
  if (score >= 65) return "good"
  if (score >= 40) return "fair"
  return "poor"
}

export function computeTrustScore(input: TrustScoreInput): TrustScoreResult {
  const identityScore = input.hasVerifiedIdentity ? 100 : 40
  const rentalHistoryScore = Math.min(100, input.successfulRentalsCount * 20)
  const lateReturnsScore =
    input.completedReservationsCount > 0
      ? Math.round(100 - (input.lateReturnsCount / input.completedReservationsCount) * 100)
      : 100
  const damageFrequencyScore = Math.max(0, 100 - input.damagesCausedCount * 20)
  const paymentReliabilityScore = Math.max(0, 100 - input.outstandingBalanceIncidentsCount * 25)
  const depositHistoryScore = Math.max(0, 100 - input.depositIssuesCount * 30)

  const factors: TrustFactor[] = [
    {
      key: "identity_verification",
      label: "Document verification",
      score: identityScore,
      weight: TRUST_FACTOR_WEIGHTS.identityVerification,
    },
    {
      key: "rental_history",
      label: "Successful rentals",
      score: rentalHistoryScore,
      weight: TRUST_FACTOR_WEIGHTS.rentalHistory,
    },
    {
      key: "late_returns",
      label: "On-time returns",
      score: lateReturnsScore,
      weight: TRUST_FACTOR_WEIGHTS.lateReturns,
      note: input.completedReservationsCount === 0 ? "No completed rentals yet" : undefined,
    },
    {
      key: "damage_frequency",
      label: "Damage frequency",
      score: damageFrequencyScore,
      weight: TRUST_FACTOR_WEIGHTS.damageFrequency,
    },
    {
      key: "payment_reliability",
      label: "Payment reliability",
      score: paymentReliabilityScore,
      weight: TRUST_FACTOR_WEIGHTS.paymentReliability,
    },
    {
      key: "deposit_history",
      label: "Deposit history",
      score: depositHistoryScore,
      weight: TRUST_FACTOR_WEIGHTS.depositHistory,
      note: "Approximates 'previous disputes' via disputed/retained deposits — no separate disputes record exists.",
    },
  ]

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  const score = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight)

  return { score, band: bandForTrustScore(score), factors }
}

// ---------------------------------------------------------------------
// Lifetime value
// ---------------------------------------------------------------------

export interface CustomerLifetimeValueInput {
  /** Net revenue recorded from this customer: rental payments +
   * additional/damage charges, minus refunds. */
  lifetimeRevenueMad: number
  /** Active + completed reservations — cancelled/no-show bookings
   * never happened from a revenue perspective. */
  reservationCount: number
  /** Months since the customer's first reservation (or since they
   * were created, if they have none yet) — the frequency denominator. */
  tenureMonths: number
  preferredCategory: VehicleCategory | null
}

export interface CustomerLifetimeValueResult {
  lifetimeRevenueMad: number
  rentalFrequencyPerYear: number
  averageReservationMad: number
  /** A simple same-rate projection — average reservation value times
   * the customer's own historical frequency, not a forecasting model.
   * Explicitly not a claim of statistical prediction (bible's brief:
   * "a defensible simple projection is fine — don't over-engineer a
   * forecasting model here"). */
  expectedFutureValueMad: number
  preferredCategory: VehicleCategory | null
}

export function computeCustomerLifetimeValue(input: CustomerLifetimeValueInput): CustomerLifetimeValueResult {
  const rentalFrequencyPerYear =
    input.tenureMonths > 0 ? Math.round((input.reservationCount / (input.tenureMonths / 12)) * 100) / 100 : 0
  const averageReservationMad =
    input.reservationCount > 0 ? Math.round((input.lifetimeRevenueMad / input.reservationCount) * 100) / 100 : 0
  const expectedFutureValueMad = Math.round(averageReservationMad * rentalFrequencyPerYear * 100) / 100

  return {
    lifetimeRevenueMad: input.lifetimeRevenueMad,
    rentalFrequencyPerYear,
    averageReservationMad,
    expectedFutureValueMad,
    preferredCategory: input.preferredCategory,
  }
}
