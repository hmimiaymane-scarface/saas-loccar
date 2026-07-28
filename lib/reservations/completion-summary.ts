import type { ReservationDetail } from "@/types/rental"

/**
 * Productization wave 3 phase 30 ("Return Completion Reward") — pure
 * derivation of the "here's what this rental actually delivered"
 * summary shown once a return completes. No Supabase dependency (the
 * caller already has a fully-loaded `ReservationDetail`), so this is
 * unit-testable against hand-built fixtures, same shape as
 * `lib/reservations/smart-defaults.ts`.
 */

export interface DepositResult {
  label: string
  tone: "neutral" | "positive" | "warning"
}

export interface ReturnCompletionSummary {
  revenueMad: number
  remainingMad: number
  durationDays: number
  /** False when there's no completed return inspection to derive an
   * actual pickup->return span from, so this falls back to the
   * originally booked `numDays` — the UI must label which one it's
   * showing rather than silently presenting a booked figure as actual. */
  durationIsActual: boolean
  depositResult: DepositResult
  vehicleStateLabel: string
}

function computeDurationDays(reservation: ReservationDetail): { days: number; isActual: boolean } {
  const returnCompletedAt = reservation.returnInspection?.completedAt
  if (!returnCompletedAt) return { days: reservation.numDays, isActual: false }

  const pickupMs = new Date(reservation.pickupAt).getTime()
  const returnMs = new Date(returnCompletedAt).getTime()
  const days = Math.max(1, Math.round((returnMs - pickupMs) / 86400000))
  return { days, isActual: true }
}

function computeDepositResult(reservation: ReservationDetail): DepositResult {
  const deposit = reservation.deposit
  if (!deposit || deposit.status === "not_required") {
    return { label: "No deposit required", tone: "neutral" }
  }

  switch (deposit.status) {
    case "returned":
      return { label: `${deposit.returnedMad} MAD returned in full`, tone: "positive" }
    case "retained":
      return { label: `${deposit.retainedMad} MAD retained`, tone: "warning" }
    case "partially_returned":
      return {
        label: `${deposit.returnedMad} MAD returned, ${deposit.retainedMad} MAD retained`,
        tone: "warning",
      }
    default:
      // expected / collected / partially_collected / held / disputed —
      // a deposit exists but its outcome isn't settled yet.
      return { label: "Not yet resolved", tone: "warning" }
  }
}

function computeVehicleStateLabel(reservation: ReservationDetail): string {
  const condition = reservation.returnInspection?.overallCondition
  if (!condition) return "Condition not recorded"

  const label = condition.charAt(0).toUpperCase() + condition.slice(1)
  const newDamageCount = reservation.damages.filter((d) => !d.preExisting).length
  if (newDamageCount === 0) return `${label} condition`
  return `${label} condition — ${newDamageCount} new damage${newDamageCount === 1 ? "" : "s"} noted`
}

export function buildReturnCompletionSummary(reservation: ReservationDetail): ReturnCompletionSummary {
  const { days, isActual } = computeDurationDays(reservation)
  return {
    revenueMad: reservation.payment.totalDueMad,
    remainingMad: reservation.payment.remainingMad,
    durationDays: days,
    durationIsActual: isActual,
    depositResult: computeDepositResult(reservation),
    vehicleStateLabel: computeVehicleStateLabel(reservation),
  }
}
