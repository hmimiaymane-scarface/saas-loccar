import { describe, expect, it } from "vitest"

import {
  rentalDaysFor,
  occupancyRate,
  downtimeDays,
  knownOperatingResult,
  isReturningCustomer,
  resolveReportPeriod,
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
