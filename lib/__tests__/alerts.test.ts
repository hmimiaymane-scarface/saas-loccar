import { describe, expect, it } from "vitest"

import { urgencyForDaysUntil, daysUntil, isWithinWarningWindow } from "../alerts"

describe("daysUntil", () => {
  it("is 0 for a date-only string that is today", () => {
    const today = new Date().toISOString().slice(0, 10)
    // Using the exact millisecond "now" the function itself will use
    // avoids a real (if vanishingly rare) flake right at midnight UTC.
    const nowMs = new Date(`${today}T00:00:00Z`).getTime()
    expect(daysUntil(today, nowMs)).toBe(0)
  })

  it("is positive for a future date and negative for a past one", () => {
    const nowMs = new Date("2026-07-18T00:00:00Z").getTime()
    expect(daysUntil("2026-07-25", nowMs)).toBe(7)
    expect(daysUntil("2026-07-10", nowMs)).toBe(-8)
  })

  it("accepts a full timestamp, not just a date-only string", () => {
    const nowMs = new Date("2026-07-18T00:00:00Z").getTime()
    expect(daysUntil("2026-07-20T15:30:00Z", nowMs)).toBe(2)
  })
})

describe("urgencyForDaysUntil — maintenance and document-expiry reminders share this rule", () => {
  it("is overdue for any negative days-until", () => {
    expect(urgencyForDaysUntil(-1)).toBe("overdue")
    expect(urgencyForDaysUntil(-30)).toBe("overdue")
  })

  it("is due_now for exactly 0 days", () => {
    expect(urgencyForDaysUntil(0)).toBe("due_now")
  })

  it("is due_soon for any positive days-until, however far out", () => {
    expect(urgencyForDaysUntil(1)).toBe("due_soon")
    expect(urgencyForDaysUntil(14)).toBe("due_soon")
  })
})

describe("isWithinWarningWindow", () => {
  const nowMs = new Date("2026-07-18T00:00:00Z").getTime()

  it("is true inside the configured threshold", () => {
    expect(isWithinWarningWindow("2026-07-25", 14, nowMs)).toBe(true)
  })

  it("is false outside the configured threshold", () => {
    expect(isWithinWarningWindow("2026-08-15", 14, nowMs)).toBe(false)
  })

  it("is true for an already-overdue date regardless of threshold — overdue is still something to alert on", () => {
    expect(isWithinWarningWindow("2026-07-01", 14, nowMs)).toBe(true)
  })

  it("respects a company-configured threshold rather than a hardcoded number", () => {
    // Same date, two different companies' thresholds disagree — that's
    // the whole point of making this configurable per company.
    expect(isWithinWarningWindow("2026-08-01", 7, nowMs)).toBe(false)
    expect(isWithinWarningWindow("2026-08-01", 30, nowMs)).toBe(true)
  })
})
