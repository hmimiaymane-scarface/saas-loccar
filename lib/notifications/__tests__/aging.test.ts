import { describe, expect, it } from "vitest"

import { agePriority, AGING_THRESHOLD_DAYS } from "../aging"

const NOW = new Date("2026-07-26T00:00:00Z")

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

describe("agePriority", () => {
  it("does not escalate before the threshold", () => {
    expect(agePriority("important", daysAgoIso(AGING_THRESHOLD_DAYS.important - 1), NOW)).toBe("important")
  })

  it("escalates a long-unresolved important item to operational", () => {
    expect(agePriority("important", daysAgoIso(AGING_THRESHOLD_DAYS.important), NOW)).toBe("operational")
  })

  it("escalates a long-unresolved operational item to critical", () => {
    expect(agePriority("operational", daysAgoIso(AGING_THRESHOLD_DAYS.operational), NOW)).toBe("critical")
  })

  it("escalates a long-unresolved informational item to important", () => {
    expect(agePriority("informational", daysAgoIso(AGING_THRESHOLD_DAYS.informational), NOW)).toBe("important")
  })

  it("never escalates critical further — nothing above it", () => {
    expect(agePriority("critical", daysAgoIso(365), NOW)).toBe("critical")
  })
})
