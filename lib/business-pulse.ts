import { scoreBand, type Tone } from "@/lib/tone"

/**
 * Roadmap phase 13 requirement 3 — "Business Pulse": a concise
 * qualitative label per category, each backed by a real, named
 * threshold (documented right here, not scattered across the
 * codebase or left implicit in a component). Pure: takes already-
 * fetched aggregates, no Supabase dependency, so every label boundary
 * is hand-fixture tested. The bible's own example list is Fleet
 * Status, Customers, Reservations, Revenue, Maintenance, Cash Flow,
 * Documents, Employees — "Employees" is renamed "Team" here and
 * deliberately kept factual rather than a judgment label, since this
 * app has no shift-scheduling concept for "on schedule" to honestly
 * mean anything against (see the Team section below).
 */

export interface PulseEntry {
  label: string
  tone: Tone
}

export interface BusinessPulseSummary {
  fleet: PulseEntry
  customers: PulseEntry
  reservations: PulseEntry
  revenue: PulseEntry
  maintenance: PulseEntry
  cashFlow: PulseEntry
  documents: PulseEntry
  team: PulseEntry
}

/** How far above/below a trailing baseline counts as a real change
 * rather than ordinary month-to-month noise — same order of magnitude
 * across every "compare to a baseline" category here, for one
 * consistent notion of "meaningfully different." */
const TREND_THRESHOLD_PERCENT = 10

/** Outstanding balance below this share of a month's revenue is
 * normal float (invoices in flight); above it is a real collections
 * concern worth flagging. */
const CASH_FLOW_OUTSTANDING_RATIO_THRESHOLD = 0.15

function percentChange(current: number, baseline: number): number {
  if (baseline === 0) return current > 0 ? 100 : 0
  return ((current - baseline) / baseline) * 100
}

/** Fleet Status — reuses `lib/tone.ts#scoreBand`'s exact thresholds
 * (the same "Healthy / Needs Attention / Critical" vocabulary phase
 * 06's vehicle health score already uses), applied to the fleet-wide
 * average health score rather than inventing a second scale.
 *
 * Roadmap phase 53 — `scoreBand(0)` reads as "Critical", which is
 * correct for a real vehicle scoring 0 but wrong for a brand-new
 * company with no vehicles at all (average of an empty set is also
 * 0). `vehicleCount` disambiguates the two: zero vehicles is "no
 * data yet," not the worst possible real score. */
export function computeFleetPulse(averageHealthScore: number, vehicleCount: number): PulseEntry {
  if (vehicleCount === 0) return { label: "No vehicles yet", tone: "neutral" }
  const { tone, label } = scoreBand(averageHealthScore)
  return { label, tone }
}

export function computeCustomerPulse(newCustomersThisMonth: number, newCustomersLastMonth: number): PulseEntry {
  const change = percentChange(newCustomersThisMonth, newCustomersLastMonth)
  if (change > TREND_THRESHOLD_PERCENT) return { label: "Growing", tone: "positive" }
  if (change < -TREND_THRESHOLD_PERCENT) return { label: "Declining", tone: "warning" }
  return { label: "Stable", tone: "neutral" }
}

export function computeReservationsPulse(thisMonthCount: number, trailingAverageCount: number): PulseEntry {
  const change = percentChange(thisMonthCount, trailingAverageCount)
  if (change > TREND_THRESHOLD_PERCENT) return { label: "Above average", tone: "positive" }
  if (change < -TREND_THRESHOLD_PERCENT) return { label: "Below average", tone: "warning" }
  return { label: "Average", tone: "neutral" }
}

export function computeRevenuePulse(thisMonthMad: number, lastMonthMad: number): PulseEntry {
  const change = percentChange(thisMonthMad, lastMonthMad)
  if (change > TREND_THRESHOLD_PERCENT) return { label: "Growing", tone: "positive" }
  if (change < -TREND_THRESHOLD_PERCENT) return { label: "Declining", tone: "critical" }
  return { label: "Stable", tone: "neutral" }
}

export function computeMaintenancePulse(dueOrOverdueCount: number): PulseEntry {
  return dueOrOverdueCount === 0 ? { label: "On track", tone: "positive" } : { label: "Attention required", tone: "warning" }
}

export function computeCashFlowPulse(outstandingBalanceMad: number, revenueThisMonthMad: number): PulseEntry {
  const ratio = revenueThisMonthMad > 0 ? outstandingBalanceMad / revenueThisMonthMad : outstandingBalanceMad > 0 ? 1 : 0
  return ratio <= CASH_FLOW_OUTSTANDING_RATIO_THRESHOLD ? { label: "Healthy", tone: "positive" } : { label: "Needs attention", tone: "warning" }
}

export function computeDocumentsPulse(expiringOrExpiredCount: number): PulseEntry {
  if (expiringOrExpiredCount === 0) return { label: "All current", tone: "positive" }
  return { label: `${expiringOrExpiredCount} expiring`, tone: "warning" }
}

/** Purely factual, not a judgment call — "on schedule" has no real
 * meaning in this app (no shift-scheduling concept exists), so this
 * states the two real numbers instead of inventing a health label
 * that isn't backed by anything. */
export function computeTeamPulse(activeCount: number, pendingInvitations: number): PulseEntry {
  const label = pendingInvitations > 0 ? `${activeCount} active, ${pendingInvitations} pending` : `${activeCount} active`
  return { label, tone: "neutral" }
}

export interface BusinessPulseInput {
  averageFleetHealthScore: number
  fleetVehicleCount: number
  newCustomersThisMonth: number
  newCustomersLastMonth: number
  reservationsThisMonth: number
  reservationsTrailingAverage: number
  revenueThisMonthMad: number
  revenueLastMonthMad: number
  maintenanceDueOrOverdueCount: number
  outstandingBalanceMad: number
  documentsExpiringCount: number
  activeTeamCount: number
  pendingInvitationsCount: number
}

export function computeBusinessPulse(input: BusinessPulseInput): BusinessPulseSummary {
  return {
    fleet: computeFleetPulse(input.averageFleetHealthScore, input.fleetVehicleCount),
    customers: computeCustomerPulse(input.newCustomersThisMonth, input.newCustomersLastMonth),
    reservations: computeReservationsPulse(input.reservationsThisMonth, input.reservationsTrailingAverage),
    revenue: computeRevenuePulse(input.revenueThisMonthMad, input.revenueLastMonthMad),
    maintenance: computeMaintenancePulse(input.maintenanceDueOrOverdueCount),
    cashFlow: computeCashFlowPulse(input.outstandingBalanceMad, input.revenueThisMonthMad),
    documents: computeDocumentsPulse(input.documentsExpiringCount),
    team: computeTeamPulse(input.activeTeamCount, input.pendingInvitationsCount),
  }
}
