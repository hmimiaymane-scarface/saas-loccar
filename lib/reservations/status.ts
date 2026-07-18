import type { BookingStatus } from "@/types/rental"

/**
 * Mirrors the transition table inside the `transition_reservation_status`
 * Postgres function (supabase/migrations/20260719091000_gated_rental_transitions.sql)
 * exactly. The database is what actually enforces this — a direct API
 * call or a bug elsewhere can never force an illegal transition — but the
 * UI needs the same table to know which action buttons to offer.
 *
 * `active` and `completed` are deliberately unreachable here: as of the
 * handoff phase, becoming active requires a completed pickup inspection
 * and becoming completed requires a completed return inspection, so those
 * two states are only reachable through `activate_rental()` /
 * `complete_rental()` (see app/(dashboard)/reservations/actions.ts) — not
 * through this generic transition. `active` also has no generic outbound
 * transition at all: an active rental can't be cancelled through the
 * ordinary cancel action, only completed through the guided return flow.
 */
export const RESERVATION_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  request: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "no_show"],
  active: [],
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

// Statuses with no further rental lifecycle at all. Deliberately not
// derived from RESERVATION_STATUS_TRANSITIONS: "active" also has no
// generic outbound transition (see the comment above), but it is very
// much not terminal — it still becomes "completed" via the guided return
// flow. Conflating the two would make `isTerminalStatus("active")` lie.
const TERMINAL_STATUSES: BookingStatus[] = ["completed", "cancelled", "no_show"]

export function isTerminalStatus(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// A reservation is only freely editable through the generic edit form
// while it's still being set up. Once active, changes to vehicle/dates/
// pricing should go through the guided return flow (or an owner/manager
// override) instead of a silent edit mid-rental.
export function isEditableStatus(status: BookingStatus): boolean {
  return !isTerminalStatus(status) && status !== "active"
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
