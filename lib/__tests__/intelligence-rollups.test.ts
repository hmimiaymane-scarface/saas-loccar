import { describe, expect, it } from "vitest"

import { summarizeScores } from "@/lib/intelligence-rollups"

describe("summarizeScores", () => {
  it("averages scores and tallies bands", () => {
    const result = summarizeScores([
      { score: 90, band: "excellent" },
      { score: 70, band: "good" },
      { score: 30, band: "poor" },
    ])
    expect(result.averageScore).toBe(63) // round((90+70+30)/3) = round(63.33)
    expect(result.entityCount).toBe(3)
    expect(result.bandCounts).toEqual({ excellent: 1, good: 1, poor: 1 })
  })

  it("returns a zeroed rollup for no entities, not a divide-by-zero crash", () => {
    expect(summarizeScores([])).toEqual({ averageScore: 0, entityCount: 0, bandCounts: {} })
  })

  it("tallies repeated bands correctly", () => {
    const result = summarizeScores([
      { score: 80, band: "good" },
      { score: 75, band: "good" },
      { score: 85, band: "excellent" },
    ])
    expect(result.bandCounts).toEqual({ good: 2, excellent: 1 })
  })
})
