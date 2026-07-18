/**
 * Centralized reservation pricing. Every place that shows or saves a
 * price — the reservation form's live summary, the create/update server
 * actions, the detail page — calls into this module rather than
 * recomputing the arithmetic locally, so the rule only lives in one place.
 *
 * Charged-days rule (documented once, used everywhere): any part of a
 * calendar day counts as a full rental day, with a one-day minimum. A
 * pickup at 18:00 and a return at 10:00 the next morning is 1 charged
 * day; a pickup at 10:00 and a return at 18:00 two days later is 3.
 * This is deliberately simple for this phase — see the phase brief for
 * why (no seasonal/dynamic pricing yet) — but is isolated here so a more
 * nuanced rule (e.g. a grace-hour window) can replace just this function
 * later without touching call sites.
 *
 * Money is handled in integer cents internally so discount/total/
 * remaining math can't drift from ordinary floating-point rounding.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function calculateChargedDays(
  pickupAt: Date | string,
  returnAt: Date | string
): number {
  const start = new Date(pickupAt).getTime()
  const end = new Date(returnAt).getTime()
  const diffMs = end - start
  if (diffMs <= 0) return 0
  return Math.max(1, Math.ceil(diffMs / MS_PER_DAY))
}

function toCents(mad: number): number {
  return Math.round(mad * 100)
}

function fromCents(cents: number): number {
  return cents / 100
}

export interface PricingInput {
  dailyRateMad: number
  pickupAt: Date | string
  returnAt: Date | string
  discountMad?: number
  amountPaidMad?: number
}

export interface PricingResult {
  numDays: number
  baseAmountMad: number
  discountMad: number
  totalMad: number
  amountPaidMad: number
  remainingMad: number
}

export function calculatePricing(input: PricingInput): PricingResult {
  const numDays = calculateChargedDays(input.pickupAt, input.returnAt)
  const baseCents = toCents(input.dailyRateMad) * numDays
  const discountCents = Math.min(Math.max(toCents(input.discountMad ?? 0), 0), baseCents)
  const totalCents = Math.max(baseCents - discountCents, 0)
  const paidCents = Math.max(toCents(input.amountPaidMad ?? 0), 0)
  const remainingCents = Math.max(totalCents - paidCents, 0)

  return {
    numDays,
    baseAmountMad: fromCents(baseCents),
    discountMad: fromCents(discountCents),
    totalMad: fromCents(totalCents),
    amountPaidMad: fromCents(paidCents),
    remainingMad: fromCents(remainingCents),
  }
}

export type DerivedPaymentStatus = "paid" | "partial" | "unpaid"

export function paymentStatusFromAmounts(
  totalMad: number,
  paidMad: number
): DerivedPaymentStatus {
  if (totalMad > 0 && paidMad >= totalMad) return "paid"
  if (paidMad > 0) return "partial"
  return "unpaid"
}
