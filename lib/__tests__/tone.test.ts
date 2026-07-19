import { describe, expect, it } from "vitest"

import { confidenceTier, scoreBand } from "@/lib/tone"

describe("confidenceTier", () => {
  it("is positive at and above 90", () => {
    expect(confidenceTier(100)).toBe("positive")
    expect(confidenceTier(90)).toBe("positive")
  })

  it("is warning between 70 and 89", () => {
    expect(confidenceTier(89)).toBe("warning")
    expect(confidenceTier(70)).toBe("warning")
  })

  it("is critical below 70", () => {
    expect(confidenceTier(69)).toBe("critical")
    expect(confidenceTier(0)).toBe("critical")
  })
})

describe("scoreBand", () => {
  it("is Healthy at and above 70", () => {
    expect(scoreBand(100)).toEqual({ tone: "positive", label: "Healthy" })
    expect(scoreBand(70)).toEqual({ tone: "positive", label: "Healthy" })
  })

  it("is Needs Attention between 40 and 69", () => {
    expect(scoreBand(69)).toEqual({ tone: "warning", label: "Needs Attention" })
    expect(scoreBand(40)).toEqual({ tone: "warning", label: "Needs Attention" })
  })

  it("is Critical below 40", () => {
    expect(scoreBand(39)).toEqual({ tone: "critical", label: "Critical" })
    expect(scoreBand(0)).toEqual({ tone: "critical", label: "Critical" })
  })
})
