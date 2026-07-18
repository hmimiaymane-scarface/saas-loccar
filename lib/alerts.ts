import type { AlertUrgency } from "@/types/rental"

/**
 * Days-until-due -> urgency, shared by every live alert that's driven by
 * a date (maintenance, document expiry, licence expiry). Pure so it's
 * unit-testable and so "due soon" always means the same thing everywhere
 * it's used, driven by the company's own configured threshold rather than
 * a hardcoded number.
 */
export function urgencyForDaysUntil(daysUntil: number): AlertUrgency {
  if (daysUntil < 0) return "overdue"
  if (daysUntil === 0) return "due_now"
  return "due_soon"
}

export function daysUntil(dateIso: string, nowMs: number): number {
  const due = new Date(dateIso.length <= 10 ? `${dateIso}T00:00:00Z` : dateIso).getTime()
  return Math.floor((due - nowMs) / 86_400_000)
}

/** True when a date falls within the warning window (including overdue —
 * an overdue item is still very much something to alert on). */
export function isWithinWarningWindow(dateIso: string, warningDays: number, nowMs: number): boolean {
  return daysUntil(dateIso, nowMs) <= warningDays
}
