import { calculateChargedDays } from "@/lib/pricing"
import { zonedTimeToUtcIso, utcIsoToZonedLocal } from "@/lib/timezone"

/**
 * Pure calculation definitions shared by the overview page, the reports
 * page, vehicle-level economics, and CSV exports — the phase brief's
 * "the overview, reports, vehicle details and CSV exports must use the
 * same definitions" requirement, made structural rather than a promise:
 * there is exactly one function for each of these, and every caller
 * imports it rather than re-deriving the formula.
 *
 * Deliberately pure (no Supabase import) so every definition here is
 * unit-testable without a live database.
 */

export type ReportPeriod = "today" | "this_week" | "this_month" | "last_month" | "custom"

export interface ReportDateRange {
  fromIso: string
  toIso: string
}

/** "Rental days" for a single reservation — the same day-rounding rule
 * used to price it (calculateChargedDays), not a separate report-only
 * definition that could disagree with what the customer was actually
 * charged for. */
export function rentalDaysFor(pickupAt: string, returnAt: string): number {
  return calculateChargedDays(pickupAt, returnAt)
}

/** Occupancy = rented-vehicle-days actually delivered, divided by the
 * fleet-days theoretically available over the period. 0 when there's no
 * fleet or no period length, never NaN/Infinity. */
export function occupancyRate(rentedDays: number, fleetSize: number, periodDays: number): number {
  const availableDays = fleetSize * periodDays
  if (availableDays <= 0) return 0
  return Math.round((rentedDays / availableDays) * 100)
}

/** Days a vehicle spent NOT available for rent within a period (in
 * maintenance, unavailable, or otherwise not earning) — the complement of
 * occupancy at the single-vehicle level, used on the vehicle detail page
 * and the fleet performance table. */
export function downtimeDays(periodDays: number, activeDays: number): number {
  return Math.max(0, periodDays - activeDays)
}

/** "Known operating result" — revenue recorded minus expenses recorded,
 * for the same period. Explicitly not a claim of full accounting profit
 * (see the brief's "do not pretend it represents full accounting profit"
 * — every UI that shows this must label it as "known"/"recorded".) */
export function knownOperatingResult(recordedRevenueMad: number, recordedExpensesMad: number): number {
  return recordedRevenueMad - recordedExpensesMad
}

/** A customer counts as "returning" once they have more than one
 * non-cancelled, non-no-show booking — the same threshold everywhere a
 * "new vs returning" split is shown, so the two numbers always add up to
 * the same total customer count. */
export function isReturningCustomer(nonCancelledBookingCount: number): boolean {
  return nonCancelledBookingCount > 1
}

function localDateParts(timeZone: string, date: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
}

function localDateToUtcIso(year: number, month: number, day: number, timeZone: string): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return zonedTimeToUtcIso(`${year}-${pad(month)}-${pad(day)}T00:00`, timeZone)
}

function addDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + delta)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/**
 * Resolves a named period into a concrete [fromIso, toIso) range using
 * the COMPANY's timezone for "what day is it" — never the server's or
 * browser's ambient timezone (same principle as lib/timezone.ts). Ranges
 * are half-open: fromIso is the start of the first day (inclusive), toIso
 * is the start of the day *after* the last day (exclusive) — so callers
 * can always use `>= fromIso and < toIso` and never worry about an
 * off-by-one at 23:59:59.
 */
export function resolveReportPeriod(
  period: ReportPeriod,
  timeZone: string,
  custom?: { from: string; to: string }
): ReportDateRange {
  const now = new Date()
  const today = localDateParts(timeZone, now)

  if (period === "custom" && custom) {
    const [fy, fm, fd] = custom.from.split("-").map(Number)
    const [ty, tm, td] = custom.to.split("-").map(Number)
    const dayAfterTo = addDays(ty, tm, td, 1)
    return {
      fromIso: localDateToUtcIso(fy, fm, fd, timeZone),
      toIso: localDateToUtcIso(dayAfterTo.year, dayAfterTo.month, dayAfterTo.day, timeZone),
    }
  }

  if (period === "today") {
    const tomorrow = addDays(today.year, today.month, today.day, 1)
    return {
      fromIso: localDateToUtcIso(today.year, today.month, today.day, timeZone),
      toIso: localDateToUtcIso(tomorrow.year, tomorrow.month, tomorrow.day, timeZone),
    }
  }

  if (period === "this_week") {
    const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
    const daysSinceMonday = (weekday + 6) % 7
    const monday = addDays(today.year, today.month, today.day, -daysSinceMonday)
    const nextMonday = addDays(monday.year, monday.month, monday.day, 7)
    return {
      fromIso: localDateToUtcIso(monday.year, monday.month, monday.day, timeZone),
      toIso: localDateToUtcIso(nextMonday.year, nextMonday.month, nextMonday.day, timeZone),
    }
  }

  if (period === "this_month") {
    const nextMonth = today.month === 12 ? { year: today.year + 1, month: 1 } : { year: today.year, month: today.month + 1 }
    return {
      fromIso: localDateToUtcIso(today.year, today.month, 1, timeZone),
      toIso: localDateToUtcIso(nextMonth.year, nextMonth.month, 1, timeZone),
    }
  }

  // last_month
  const thisMonthStart = { year: today.year, month: today.month }
  const lastMonth = thisMonthStart.month === 1 ? { year: thisMonthStart.year - 1, month: 12 } : { year: thisMonthStart.year, month: thisMonthStart.month - 1 }
  return {
    fromIso: localDateToUtcIso(lastMonth.year, lastMonth.month, 1, timeZone),
    toIso: localDateToUtcIso(thisMonthStart.year, thisMonthStart.month, 1, timeZone),
  }
}

export interface TrailingMonth {
  /** "YYYY-MM" in the company's timezone. */
  month: string
  range: ReportDateRange
}

/** Roadmap phase 31 ("Business Gamification Layer") — the trailing
 * calendar-month series "personal best"/"revenue streak" need, that no
 * report function before this phase required (every one of them only
 * ever compares a period against its immediate prior period). Oldest
 * to newest, always ending at the current month — anchored off
 * `resolveReportPeriod("this_month", ...)` itself so the two never
 * silently disagree about what "this month" means. */
export function resolveTrailingMonths(count: number, timeZone: string): TrailingMonth[] {
  const thisMonth = resolveReportPeriod("this_month", timeZone)
  const anchor = utcIsoToZonedLocal(thisMonth.fromIso, timeZone)
  const anchorYear = Number(anchor.slice(0, 4))
  const anchorMonth = Number(anchor.slice(5, 7))

  const months: TrailingMonth[] = []
  for (let i = count - 1; i >= 0; i--) {
    let year = anchorYear
    let month = anchorMonth - i
    while (month <= 0) {
      month += 12
      year -= 1
    }
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    months.push({
      month: `${year}-${String(month).padStart(2, "0")}`,
      range: {
        fromIso: localDateToUtcIso(year, month, 1, timeZone),
        toIso: localDateToUtcIso(nextYear, nextMonth, 1, timeZone),
      },
    })
  }
  return months
}
