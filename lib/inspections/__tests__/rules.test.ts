import { describe, expect, it } from "vitest"

import { hasRequiredFieldsToComplete, isValidReturnOdometer, missingRequiredPhotoSlots } from "../rules"

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

describe("missingRequiredPhotoSlots", () => {
  it("returns every slot when nothing has been captured", () => {
    expect(missingRequiredPhotoSlots([])).toEqual([
      "front",
      "rear",
      "driver_side",
      "passenger_side",
      "interior",
      "dashboard_odometer",
      "fuel_gauge",
    ])
  })

  it("returns an empty array once every required slot is captured", () => {
    expect(
      missingRequiredPhotoSlots([
        "front",
        "rear",
        "driver_side",
        "passenger_side",
        "interior",
        "dashboard_odometer",
        "fuel_gauge",
      ])
    ).toEqual([])
  })

  it("returns exactly the slots still missing, order preserved from the required list", () => {
    expect(missingRequiredPhotoSlots(["front", "interior", "fuel_gauge"])).toEqual([
      "rear",
      "driver_side",
      "passenger_side",
      "dashboard_odometer",
    ])
  })

  it("ignores an unrecognized captured key rather than crediting it toward a real slot", () => {
    expect(missingRequiredPhotoSlots(["front", "not_a_real_slot"])).toEqual([
      "rear",
      "driver_side",
      "passenger_side",
      "interior",
      "dashboard_odometer",
      "fuel_gauge",
    ])
  })
})
