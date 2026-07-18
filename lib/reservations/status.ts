import type { BookingStatus } from "@/types/rental"

/**
 * Mirrors the transition table inside the `transition_reservation_status`
 * Postgres function (supabase/migrations/20260718121200_reservation_status_transition.sql)
 * exactly. The database is what actually enforces this — a direct API
 * call or a bug elsewhere can never force an illegal transition — but the
 * UI needs the same table to know which action buttons to offer.
 */
export const RESERVATION_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  request: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["active", "cancelled", "no_show"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
}

export function allowedNextStatuses(current: BookingStatus): BookingStatus[] {
  return RESERVATION_STATUS_TRANSITIONS[current]
}

export function canTransition(current: BookingStatus, next: BookingStatus): boolean {
  return RESERVATION_STATUS_TRANSITIONS[current].includes(next)
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return RESERVATION_STATUS_TRANSITIONS[status].length === 0
}

const actionLabels: Partial<Record<BookingStatus, string>> = {
  pending: "Mark as pending",
  confirmed: "Confirm",
  active: "Begin rental",
  completed: "Complete rental",
  cancelled: "Cancel",
  no_show: "Mark as no-show",
}

export function actionLabelFor(next: BookingStatus): string {
  return actionLabels[next] ?? next
}
