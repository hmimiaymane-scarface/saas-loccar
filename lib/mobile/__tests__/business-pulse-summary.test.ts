import { describe, expect, it } from "vitest"

import { computeBusiestPickupDayHeadline, buildMobileBusinessPulseSummary } from "@/lib/mobile/business-pulse-summary"
import type { DailyPickupCount } from "@/lib/data"

const TZ = "Africa/Casablanca"

function counts(...pairs: [string, number][]): DailyPickupCount[] {
  return pairs.map(([date, count]) => ({ date, count }))
}

describe("computeBusiestPickupDayHeadline", () => {
  it("matches the brief's own example when the busiest day is tomorrow", () => {
    const headline = computeBusiestPickupDayHeadline(
      counts(["2026-07-27", 1], ["2026-07-28", 3], ["2026-07-29", 0]),
      "2026-07-27",
      TZ
    )
    expect(headline).toBe("Tomorrow is your busiest pickup day this week.")
  })

  it("names the weekday when the busiest day isn't tomorrow", () => {
    const headline = computeBusiestPickupDayHeadline(
      counts(["2026-07-27", 1], ["2026-07-28", 1], ["2026-07-30", 4]),
      "2026-07-27",
      TZ
    )
    expect(headline).toBe("Thursday is your busiest pickup day this week.")
  })

  it("reports nothing when no day clears the minimum count", () => {
    const headline = computeBusiestPickupDayHeadline(counts(["2026-07-27", 1], ["2026-07-28", 1]), "2026-07-27", TZ)
    expect(headline).toBeNull()
  })

  it("reports nothing for a completely empty week", () => {
    expect(computeBusiestPickupDayHeadline([], "2026-07-27", TZ)).toBeNull()
  })

  it("breaks ties by whichever day comes first", () => {
    const headline = computeBusiestPickupDayHeadline(
      counts(["2026-07-27", 3], ["2026-07-29", 3]),
      "2026-07-30", // neither is "tomorrow", so the weekday name proves which one won
      TZ
    )
    expect(headline).toBe("Monday is your busiest pickup day this week.")
  })
})

describe("buildMobileBusinessPulseSummary", () => {
  it("returns both lines when both have something to say", () => {
    expect(buildMobileBusinessPulseSummary("Strong month: revenue is up 14%.", "Tomorrow is your busiest pickup day this week.")).toEqual([
      "Strong month: revenue is up 14%.",
      "Tomorrow is your busiest pickup day this week.",
    ])
  })

  it("returns just one line when only one has something to say", () => {
    expect(buildMobileBusinessPulseSummary("Strong month: revenue is up 14%.", null)).toEqual(["Strong month: revenue is up 14%."])
    expect(buildMobileBusinessPulseSummary(null, "Tomorrow is your busiest pickup day this week.")).toEqual([
      "Tomorrow is your busiest pickup day this week.",
    ])
  })

  it("returns an empty array, never a forced placeholder, when neither has anything to say", () => {
    expect(buildMobileBusinessPulseSummary(null, null)).toEqual([])
  })

  it("never exceeds 2 lines", () => {
    expect(buildMobileBusinessPulseSummary("a", "b").length).toBeLessThanOrEqual(2)
  })
})
