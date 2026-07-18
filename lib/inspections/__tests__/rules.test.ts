import { describe, expect, it } from "vitest"

import { hasRequiredFieldsToComplete, isValidReturnOdometer } from "../rules"

describe("hasRequiredFieldsToComplete", () => {
  it("requires both odometer and fuel level", () => {
    expect(hasRequiredFieldsToComplete({ odometerKm: 12000, fuelLevel: "full" })).toBe(true)
  })

  it("rejects a missing odometer", () => {
    expect(hasRequiredFieldsToComplete({ odometerKm: null, fuelLevel: "full" })).toBe(false)
  })

  it("rejects a missing fuel level", () => {
    expect(hasRequiredFieldsToComplete({ odometerKm: 12000, fuelLevel: null })).toBe(false)
  })

  it("accepts an odometer of exactly 0 (not falsy-checked away)", () => {
    expect(hasRequiredFieldsToComplete({ odometerKm: 0, fuelLevel: "empty" })).toBe(true)
  })
})

describe("isValidReturnOdometer", () => {
  it("accepts a return odometer higher than pickup", () => {
    expect(isValidReturnOdometer(12150, 12000)).toBe(true)
  })

  it("accepts a return odometer exactly equal to pickup (no driving recorded)", () => {
    expect(isValidReturnOdometer(12000, 12000)).toBe(true)
  })

  it("rejects a return odometer lower than pickup — the vehicle doesn't drive backwards", () => {
    expect(isValidReturnOdometer(11950, 12000)).toBe(false)
  })

  it("passes when there is no pickup reading to compare against yet", () => {
    expect(isValidReturnOdometer(12150, null)).toBe(true)
  })
})
