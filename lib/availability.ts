/**
 * Centralized availability rules. Mirrors the database's source of truth
 * exactly on purpose:
 *
 *   - The blocking statuses here (`pending`, `confirmed`, `active`) must
 *     match the WHERE clause of the `reservations_no_overlap` EXCLUDE
 *     constraint in
 *     supabase/migrations/20260718121000_double_booking_protection.sql.
 *   - The overlap test (`periodsOverlap`) uses the same half-open
 *     interval semantics as that constraint's `tstzrange(pickup_at,
 *     return_at, '[)')` — a return at the same instant as the next
 *     pickup does NOT count as an overlap, so back-to-back bookings on
 *     the same day are allowed.
 *
 * The database constraint is the actual enforcement (it holds even under
 * a race between two employees); this module is what the UI uses to show
 * availability *before* a write is attempted, and what tests exercise
 * without needing a database.
 */

import type { BookingStatus } from "@/types/rental"

export const BLOCKING_RESERVATION_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "active",
]

export function reservationBlocksVehicle(status: BookingStatus): boolean {
  return BLOCKING_RESERVATION_STATUSES.includes(status)
}

export function periodsOverlap(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string
): boolean {
  const aS = new Date(aStart).getTime()
  const aE = new Date(aEnd).getTime()
  const bS = new Date(bStart).getTime()
  const bE = new Date(bEnd).getTime()
  return aS < bE && bS < aE
}

export interface ExistingReservationWindow {
  id: string
  vehicleId: string | null
  status: BookingStatus
  startDate: string
  endDate: string
}

/**
 * Pure function: given a candidate vehicle id, the requested window, and
 * the company's other reservations, is this vehicle free? Used both by
 * the server-side availability query (lib/data.ts#getAvailableVehicles)
 * and directly by unit tests — no Supabase client involved.
 *
 * `excludeReservationId` lets an edit form check availability without the
 * reservation being edited counting as its own conflict.
 */
export function isVehicleAvailable(
  vehicleId: string,
  window: { startDate: string; endDate: string },
  existingReservations: ExistingReservationWindow[],
  excludeReservationId?: string
): boolean {
  return !existingReservations.some((r) => {
    if (r.vehicleId !== vehicleId) return false
    if (r.id === excludeReservationId) return false
    if (!reservationBlocksVehicle(r.status)) return false
    return periodsOverlap(window.startDate, window.endDate, r.startDate, r.endDate)
  })
}

/**
 * Productization wave 3 phase 23 — "show conflicts clearly." The
 * specific reservation blocking this vehicle for the requested window
 * (if any), so the UI can say *why* it's unavailable ("booked until
 * {date}") instead of just omitting the vehicle from the list.
 */
export function findConflictingReservation(
  vehicleId: string,
  window: { startDate: string; endDate: string },
  existingReservations: ExistingReservationWindow[],
  excludeReservationId?: string
): ExistingReservationWindow | null {
  return (
    existingReservations.find((r) => {
      if (r.vehicleId !== vehicleId) return false
      if (r.id === excludeReservationId) return false
      if (!reservationBlocksVehicle(r.status)) return false
      return periodsOverlap(window.startDate, window.endDate, r.startDate, r.endDate)
    }) ?? null
  )
}

/** A vehicle's next booking starting this close to the requested
 * return counts as a tight turnaround worth flagging — a first-pass
 * threshold, not a scientifically calibrated one. */
export const TIGHT_TURNAROUND_HOURS = 24

/**
 * Phase 23 — "next booking warning if close to return date." The
 * closest upcoming reservation on this vehicle starting at or after
 * `afterIso` (the requested return) — only meaningful for a vehicle
 * that's actually available for the requested window (an overlapping
 * one would already be a conflict, not a "next booking").
 */
export function findNextReservationAfter(
  vehicleId: string,
  afterIso: string,
  existingReservations: ExistingReservationWindow[],
  excludeReservationId?: string
): ExistingReservationWindow | null {
  const afterTime = new Date(afterIso).getTime()
  const upcoming = existingReservations
    .filter((r) => {
      if (r.vehicleId !== vehicleId) return false
      if (r.id === excludeReservationId) return false
      if (!reservationBlocksVehicle(r.status)) return false
      return new Date(r.startDate).getTime() >= afterTime
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  return upcoming[0] ?? null
}

/** Hours between two ISO timestamps, always non-negative. */
export function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(bIso).getTime() - new Date(aIso).getTime()) / (1000 * 60 * 60)
}
