import { describe, expect, it } from "vitest"

import {
  groupBookingsByDate,
  groupBookingsByVehicle,
  groupMaintenanceByDate,
  groupMaintenanceByVehicle,
} from "@/lib/calendar-grouping"
import type { Booking } from "@/types/rental"
import type { MaintenanceBlock } from "@/lib/data"

function booking(overrides: Partial<Booking> & Pick<Booking, "id" | "startDate" | "endDate">): Booking {
  return {
    reference: "RB-1",
    customer: { id: "cus_1", fullName: "Test Customer" },
    vehicle: { id: "veh_1", make: "Dacia", model: "Duster", plate: "1234-A-1", category: "suv" },
    requestedCategory: null,
    pickupLocation: "Agency",
    returnLocation: "Agency",
    status: "confirmed",
    isOverdue: false,
    payment: { totalMad: 0, paidMad: 0, dueMad: 0, status: "unpaid" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Booking
}

function maintenance(overrides: Partial<MaintenanceBlock> & Pick<MaintenanceBlock, "id" | "vehicleId" | "date">): MaintenanceBlock {
  return { vehicleLabel: "Dacia Duster", title: "Oil change", ...overrides }
}

describe("groupBookingsByVehicle", () => {
  it("groups bookings under their vehicle id", () => {
    const b1 = booking({ id: "bk_1", startDate: "2026-07-01", endDate: "2026-07-03", vehicle: { id: "veh_1", make: "Dacia", model: "Duster", plate: "1", category: "suv" } })
    const b2 = booking({ id: "bk_2", startDate: "2026-07-02", endDate: "2026-07-04", vehicle: { id: "veh_2", make: "Renault", model: "Clio", plate: "2", category: "economy" } })
    const b3 = booking({ id: "bk_3", startDate: "2026-07-05", endDate: "2026-07-06", vehicle: { id: "veh_1", make: "Dacia", model: "Duster", plate: "1", category: "suv" } })

    const map = groupBookingsByVehicle([b1, b2, b3])

    expect(map.get("veh_1")).toEqual([b1, b3])
    expect(map.get("veh_2")).toEqual([b2])
    expect(map.get("veh_missing")).toBeUndefined()
  })

  it("skips bookings with no assigned vehicle", () => {
    const b1 = booking({ id: "bk_1", startDate: "2026-07-01", endDate: "2026-07-01", vehicle: null })
    expect(groupBookingsByVehicle([b1]).size).toBe(0)
  })
})

describe("groupMaintenanceByVehicle", () => {
  it("groups maintenance blocks under their vehicle id", () => {
    const m1 = maintenance({ id: "m_1", vehicleId: "veh_1", date: "2026-07-01" })
    const m2 = maintenance({ id: "m_2", vehicleId: "veh_2", date: "2026-07-02" })
    const map = groupMaintenanceByVehicle([m1, m2])
    expect(map.get("veh_1")).toEqual([m1])
    expect(map.get("veh_2")).toEqual([m2])
  })
})

describe("groupBookingsByDate", () => {
  it("files a single-day booking as a pickup only, not also a return", () => {
    const b1 = booking({ id: "bk_1", startDate: "2026-07-01", endDate: "2026-07-01" })
    const map = groupBookingsByDate([b1])
    expect(map.get("2026-07-01")).toEqual({ pickups: [b1], returns: [] })
  })

  it("files a multi-day booking as a pickup on start date and a return on end date", () => {
    const b1 = booking({ id: "bk_1", startDate: "2026-07-01", endDate: "2026-07-03" })
    const map = groupBookingsByDate([b1])
    expect(map.get("2026-07-01")).toEqual({ pickups: [b1], returns: [] })
    expect(map.get("2026-07-03")).toEqual({ pickups: [], returns: [b1] })
    expect(map.has("2026-07-02")).toBe(false)
  })
})

describe("groupMaintenanceByDate", () => {
  it("groups maintenance blocks under their scheduled date", () => {
    const m1 = maintenance({ id: "m_1", vehicleId: "veh_1", date: "2026-07-01" })
    const m2 = maintenance({ id: "m_2", vehicleId: "veh_2", date: "2026-07-01" })
    const map = groupMaintenanceByDate([m1, m2])
    expect(map.get("2026-07-01")).toEqual([m1, m2])
  })
})
