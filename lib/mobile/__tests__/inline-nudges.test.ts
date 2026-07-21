import { describe, expect, it } from "vitest"

import { buildInlineNudges } from "../inline-nudges"

describe("buildInlineNudges", () => {
  it("nudges about every missing required photo, listed by label", () => {
    const nudges = buildInlineNudges({ capturedPhotoSlots: ["front", "rear"], vehicleDamageCount: 0 })
    expect(nudges).toHaveLength(1)
    expect(nudges[0].tone).toBe("warning")
    expect(nudges[0].message).toContain("driver side")
    expect(nudges[0].message).toContain("fuel gauge")
  })

  it("says nothing about photos once every required slot is captured", () => {
    const nudges = buildInlineNudges({
      capturedPhotoSlots: ["front", "rear", "driver_side", "passenger_side", "interior", "dashboard_odometer", "fuel_gauge"],
      vehicleDamageCount: 0,
    })
    expect(nudges.find((n) => n.id === "missing-photos")).toBeUndefined()
  })

  it("nudges about prior damage on file, singular phrasing for exactly one", () => {
    const nudges = buildInlineNudges({ capturedPhotoSlots: [], vehicleDamageCount: 1 })
    const damageNudge = nudges.find((n) => n.id === "prior-damage")
    expect(damageNudge?.message).toContain("1 damage record on file")
    expect(damageNudge?.tone).toBe("info")
  })

  it("nudges about prior damage, plural phrasing for more than one", () => {
    const nudges = buildInlineNudges({ capturedPhotoSlots: [], vehicleDamageCount: 3 })
    expect(nudges.find((n) => n.id === "prior-damage")?.message).toContain("3 damage records on file")
  })

  it("says nothing about damage when there is none on file", () => {
    const nudges = buildInlineNudges({ capturedPhotoSlots: [], vehicleDamageCount: 0 })
    expect(nudges.find((n) => n.id === "prior-damage")).toBeUndefined()
  })

  it("returns an empty list when nothing needs surfacing", () => {
    expect(
      buildInlineNudges({
        capturedPhotoSlots: ["front", "rear", "driver_side", "passenger_side", "interior", "dashboard_odometer", "fuel_gauge"],
        vehicleDamageCount: 0,
      })
    ).toEqual([])
  })
})
