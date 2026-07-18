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
