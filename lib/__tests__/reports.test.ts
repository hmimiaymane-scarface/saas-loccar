import { describe, expect, it } from "vitest"

import {
  rentalDaysFor,
  occupancyRate,
  downtimeDays,
  knownOperatingResult,
  isReturningCustomer,
  resolveReportPeriod,
  resolveComparableLastMonthPeriod,
  resolveTrailingMonths,
} from "../reports"

describe("rentalDaysFor", () => {
  it("matches the pricing engine's day-rounding rule (they must never disagree)", () => {
    expect(rentalDaysFor("2026-07-20T10:00:00Z", "2026-07-23T10:00:00Z")).toBe(3)
    expect(rentalDaysFor("2026-07-20T18:00:00Z", "2026-07-21T10:00:00Z")).toBe(1)
  })
})

describe("occupancyRate", () => {
  it("is rented-days over fleet-size times period-days", () => {
    expect(occupancyRate(15, 10, 30)).toBe(5) // 15 / 300 = 5%
    expect(occupancyRate(150, 10, 30)).toBe(50)
  })

  it("is 0 for an empty fleet rather than NaN or Infinity", () => {
    expect(occupancyRate(0, 0, 30)).toBe(0)
  })

  it("is 0 for a zero-length period rather than NaN or Infinity", () => {
    expect(occupancyRate(0, 10, 0)).toBe(0)
  })

  it("caps naturally at 100 when every vehicle is rented every day", () => {
    expect(occupancyRate(300, 10, 30)).toBe(100)
  })
})

describe("downtimeDays", () => {
  it("is the period minus the active days", () => {
    expect(downtimeDays(30, 22)).toBe(8)
  })

  it("never goes negative even if active days somehow exceeds the period", () => {
    expect(downtimeDays(30, 40)).toBe(0)
  })
})

describe("knownOperatingResult", () => {
  it("is revenue minus expenses, and can be negative", () => {
    expect(knownOperatingResult(10000, 4000)).toBe(6000)
    expect(knownOperatingResult(2000, 5000)).toBe(-3000)
  })
})

describe("isReturningCustomer", () => {
  it("requires more than one non-cancelled booking", () => {
    expect(isReturningCustomer(0)).toBe(false)
    expect(isReturningCustomer(1)).toBe(false)
    expect(isReturningCustomer(2)).toBe(true)
  })
})

describe("resolveReportPeriod", () => {
  const tz = "Africa/Casablanca"

  // Casablanca has used a fixed UTC+1 since 2018 (see lib/timezone.ts) —
  // midnight local time is 23:00 UTC the *previous* day, year-round.
  it("resolves a custom range to the start of the first day through the start of the day after the last", () => {
    const range = resolveReportPeriod("custom", tz, { from: "2026-07-01", to: "2026-07-31" })
    expect(range.fromIso).toBe("2026-06-30T23:00:00.000Z")
    expect(range.toIso).toBe("2026-07-31T23:00:00.000Z")
  })

  it("resolves this_month to a half-open [1st, 1st-of-next-month) range", () => {
    // Not asserting exact dates against the real "today" (that would make
    // the test's pass/fail depend on when it's run) — asserting the
    // invariant that must always hold instead: the range covers exactly
    // one calendar month as seen *in the company's timezone*, not UTC.
    const range = resolveReportPeriod("this_month", tz)
    const fromLocalDay = new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "2-digit" }).format(new Date(range.fromIso))
    expect(fromLocalDay).toBe("01")
    expect(new Date(range.toIso).getTime()).toBeGreaterThan(new Date(range.fromIso).getTime())
  })

  it("resolves last_month to end exactly where this_month begins", () => {
    const thisMonth = resolveReportPeriod("this_month", tz)
    const lastMonth = resolveReportPeriod("last_month", tz)
    expect(lastMonth.toIso).toBe(thisMonth.fromIso)
  })

  it("resolves this_week to a 7-day range", () => {
    const range = resolveReportPeriod("this_week", tz)
    const days = (new Date(range.toIso).getTime() - new Date(range.fromIso).getTime()) / 86_400_000
    expect(days).toBe(7)
  })

  it("resolves today to a 1-day range", () => {
    const range = resolveReportPeriod("today", tz)
    const days = (new Date(range.toIso).getTime() - new Date(range.fromIso).getTime()) / 86_400_000
    expect(days).toBe(1)
  })
})

describe("resolveComparableLastMonthPeriod", () => {
  const tz = "Africa/Casablanca"

  it("always starts on the 1st of last month, same as the full last_month range", () => {
    const full = resolveReportPeriod("last_month", tz)
    const comparable = resolveComparableLastMonthPeriod(tz)
    expect(comparable.fromIso).toBe(full.fromIso)
  })

  it("never extends past the full last_month range", () => {
    const full = resolveReportPeriod("last_month", tz)
    const comparable = resolveComparableLastMonthPeriod(tz)
    expect(new Date(comparable.toIso).getTime()).toBeLessThanOrEqual(new Date(full.toIso).getTime())
  })

  it("spans the same number of days elapsed so far this month, capped at last month's own length", () => {
    const todayDay = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "2-digit" }).format(new Date()))
    const full = resolveReportPeriod("last_month", tz)
    const fullDays = (new Date(full.toIso).getTime() - new Date(full.fromIso).getTime()) / 86_400_000
    const expectedDays = Math.min(todayDay, fullDays)

    const comparable = resolveComparableLastMonthPeriod(tz)
    const comparableDays = (new Date(comparable.toIso).getTime() - new Date(comparable.fromIso).getTime()) / 86_400_000
    expect(comparableDays).toBe(expectedDays)
  })
})

describe("resolveTrailingMonths", () => {
  const tz = "Africa/Casablanca"

  it("returns exactly `count` months", () => {
    expect(resolveTrailingMonths(12, tz)).toHaveLength(12)
    expect(resolveTrailingMonths(3, tz)).toHaveLength(3)
  })

  it("ends at the current month, matching resolveReportPeriod exactly", () => {
    const months = resolveTrailingMonths(6, tz)
    const thisMonth = resolveReportPeriod("this_month", tz)
    expect(months[months.length - 1].range).toEqual(thisMonth)
  })

  it("is chronologically contiguous with no gaps or overlaps", () => {
    const months = resolveTrailingMonths(12, tz)
    for (let i = 1; i < months.length; i++) {
      expect(months[i - 1].range.toIso).toBe(months[i].range.fromIso)
    }
  })

  it("labels each month as a distinct, strictly increasing YYYY-MM", () => {
    const months = resolveTrailingMonths(14, tz)
    const labels = months.map((m) => m.month)
    expect(new Set(labels).size).toBe(labels.length)
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i] > labels[i - 1]).toBe(true)
    }
  })

  it("correctly rolls back across a year boundary", () => {
    // 14 trailing months always spans a January somewhere in the middle.
    const months = resolveTrailingMonths(14, tz)
    expect(months.some((m) => m.month.endsWith("-01"))).toBe(true)
  })
})
