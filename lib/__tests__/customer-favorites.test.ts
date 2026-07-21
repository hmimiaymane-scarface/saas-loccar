import { describe, expect, it } from "vitest"

import { computeFavoriteVehicles } from "@/lib/customer-favorites"

const dacia = { id: "veh_1", make: "Dacia", model: "Duster", plate: "1234-A-1" }
const clio = { id: "veh_2", make: "Renault", model: "Clio", plate: "5678-B-1" }
const yaris = { id: "veh_3", make: "Toyota", model: "Yaris", plate: "9012-C-1" }

describe("computeFavoriteVehicles", () => {
  it("counts only completed/active reservations and ranks by count", () => {
    const result = computeFavoriteVehicles([
      { status: "completed", vehicle: dacia },
      { status: "completed", vehicle: dacia },
      { status: "completed", vehicle: dacia },
      { status: "active", vehicle: clio },
      { status: "completed", vehicle: clio },
      { status: "cancelled", vehicle: yaris },
      { status: "request", vehicle: yaris },
    ])
    expect(result).toEqual([
      { vehicleId: "veh_1", vehicleLabel: "Dacia Duster", plate: "1234-A-1", rentalCount: 3 },
      { vehicleId: "veh_2", vehicleLabel: "Renault Clio", plate: "5678-B-1", rentalCount: 2 },
    ])
  })

  it("excludes vehicles rented only once — not a real 'favorite' yet", () => {
    const result = computeFavoriteVehicles([{ status: "completed", vehicle: dacia }])
    expect(result).toEqual([])
  })

  it("skips reservations with no assigned vehicle", () => {
    const result = computeFavoriteVehicles([
      { status: "completed", vehicle: null },
      { status: "completed", vehicle: null },
    ])
    expect(result).toEqual([])
  })

  it("respects the limit", () => {
    const result = computeFavoriteVehicles(
      [
        { status: "completed", vehicle: dacia },
        { status: "completed", vehicle: dacia },
        { status: "completed", vehicle: clio },
        { status: "completed", vehicle: clio },
        { status: "completed", vehicle: yaris },
        { status: "completed", vehicle: yaris },
      ],
      1
    )
    expect(result).toEqual([{ vehicleId: "veh_1", vehicleLabel: "Dacia Duster", plate: "1234-A-1", rentalCount: 2 }])
  })

  it("returns an empty list for a customer with no history", () => {
    expect(computeFavoriteVehicles([])).toEqual([])
  })
})
