import { describe, expect, it } from "vitest"

import { mostCommonAmount, mostCommonHour, mostCommonString } from "@/lib/reservations/smart-defaults"

describe("mostCommonString", () => {
  it("returns the most frequent value", () => {
    expect(mostCommonString(["Agency – Guéliz", "Airport", "Agency – Guéliz"])).toBe("Agency – Guéliz")
  })

  it("breaks ties by whichever value appears first", () => {
    expect(mostCommonString(["Airport", "Agency – Guéliz"])).toBe("Airport")
  })

  it("ignores null/empty/whitespace-only values", () => {
    expect(mostCommonString([null, "", "  ", undefined, "Airport"])).toBe("Airport")
  })

  it("returns null given no usable values", () => {
    expect(mostCommonString([null, "", undefined])).toBeNull()
  })
})

describe("mostCommonAmount", () => {
  it("returns the most frequent positive amount", () => {
    expect(mostCommonAmount([2000, 3000, 2000])).toBe(2000)
  })

  it("ignores zero and negative amounts as noise", () => {
    expect(mostCommonAmount([0, -100, 1500])).toBe(1500)
  })

  it("returns null given no positive amounts", () => {
    expect(mostCommonAmount([0, null, undefined])).toBeNull()
  })
})

describe("mostCommonHour", () => {
  const tz = "Africa/Casablanca"

  it("returns the most common local pickup hour", () => {
    const timestamps = [
      "2026-07-15T09:00:00.000Z", // 10:00 local (UTC+1)
      "2026-07-16T08:00:00.000Z", // 09:00 local
      "2026-07-17T09:00:00.000Z", // 10:00 local
    ]
    expect(mostCommonHour(timestamps, tz)).toBe(10)
  })

  it("returns null given no timestamps", () => {
    expect(mostCommonHour([], tz)).toBeNull()
  })
})
