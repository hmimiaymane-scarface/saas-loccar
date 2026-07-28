import { describe, expect, it } from "vitest"

import {
  hasRequiredFieldsToComplete,
  isValidReturnOdometer,
  missingRequiredPhotoSlots,
  pickupCompletenessItems,
  isPickupInspectionComplete,
  returnCompletenessItems,
  isReturnInspectionComplete,
} from "../rules"

const ALL_SLOTS = ["front", "rear", "driver_side", "passenger_side", "interior", "dashboard_odometer", "fuel_gauge"]

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

describe("pickupCompletenessItems / isPickupInspectionComplete", () => {
  const complete = {
    odometerKm: 12000,
    fuelLevel: "full" as const,
    capturedPhotoSlotKeys: ALL_SLOTS,
    existingDamageReviewed: true,
  }

  it("reports every item done and overall complete when everything is provided", () => {
    const items = pickupCompletenessItems(complete)
    expect(items.every((item) => item.done)).toBe(true)
    expect(isPickupInspectionComplete(complete)).toBe(true)
  })

  it("is not complete with a missing odometer, even if everything else is done", () => {
    const progress = { ...complete, odometerKm: null }
    expect(isPickupInspectionComplete(progress)).toBe(false)
    expect(pickupCompletenessItems(progress).find((i) => i.label === "Odometer reading")?.done).toBe(false)
  })

  it("is not complete with required photos still missing", () => {
    const progress = { ...complete, capturedPhotoSlotKeys: ["front"] }
    expect(isPickupInspectionComplete(progress)).toBe(false)
    expect(pickupCompletenessItems(progress).find((i) => i.label === "Required photos")?.done).toBe(false)
  })

  it("is not complete when existing damage hasn't been reviewed, even with a vehicle that has zero damage on file", () => {
    const progress = { ...complete, existingDamageReviewed: false }
    expect(isPickupInspectionComplete(progress)).toBe(false)
    expect(pickupCompletenessItems(progress).find((i) => i.label === "Existing damage reviewed")?.done).toBe(false)
  })
})

describe("returnCompletenessItems / isReturnInspectionComplete", () => {
  const complete = {
    odometerKm: 12150,
    pickupOdometerKm: 12000,
    fuelLevel: "full" as const,
    capturedPhotoSlotKeys: ALL_SLOTS,
  }

  it("reports every item done and overall complete when everything is provided", () => {
    const items = returnCompletenessItems(complete)
    expect(items.every((item) => item.done)).toBe(true)
    expect(isReturnInspectionComplete(complete)).toBe(true)
  })

  it("is not complete with a missing odometer, even if everything else is done", () => {
    const progress = { ...complete, odometerKm: null }
    expect(isReturnInspectionComplete(progress)).toBe(false)
    expect(returnCompletenessItems(progress).find((i) => i.label === "Odometer reading")?.done).toBe(false)
  })

  it("is not complete when the return odometer is lower than pickup's, even though it's non-null", () => {
    const progress = { ...complete, odometerKm: 11950 }
    expect(isReturnInspectionComplete(progress)).toBe(false)
    expect(returnCompletenessItems(progress).find((i) => i.label === "Odometer reading")?.done).toBe(false)
  })

  it("is not complete with a missing fuel level", () => {
    const progress = { ...complete, fuelLevel: null }
    expect(isReturnInspectionComplete(progress)).toBe(false)
    expect(returnCompletenessItems(progress).find((i) => i.label === "Fuel level")?.done).toBe(false)
  })

  it("is not complete with required photos still missing", () => {
    const progress = { ...complete, capturedPhotoSlotKeys: ["front"] }
    expect(isReturnInspectionComplete(progress)).toBe(false)
    expect(returnCompletenessItems(progress).find((i) => i.label === "Required photos")?.done).toBe(false)
  })
})
