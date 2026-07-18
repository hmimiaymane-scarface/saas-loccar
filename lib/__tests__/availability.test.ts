import { describe, expect, it } from "vitest"

import { periodsOverlap, isVehicleAvailable, reservationBlocksVehicle } from "../availability"
import type { ExistingReservationWindow } from "../availability"

describe("periodsOverlap", () => {
  it("detects a straightforward overlap", () => {
    expect(periodsOverlap("2026-07-10", "2026-07-15", "2026-07-12", "2026-07-18")).toBe(true)
  })

  it("detects one period fully containing another", () => {
    expect(periodsOverlap("2026-07-10", "2026-07-20", "2026-07-12", "2026-07-14")).toBe(true)
  })

  it("does not flag adjacent, back-to-back periods as overlapping", () => {
    // A return on the 15th and a pickup on the 15th for the same vehicle
    // is allowed — same-day turnaround, matches the DB's half-open range.
    expect(periodsOverlap("2026-07-10", "2026-07-15", "2026-07-15", "2026-07-20")).toBe(false)
  })

  it("does not flag clearly separate periods as overlapping", () => {
    expect(periodsOverlap("2026-07-01", "2026-07-05", "2026-07-10", "2026-07-15")).toBe(false)
  })
})

describe("reservationBlocksVehicle", () => {
  it("treats pending, confirmed and active as blocking", () => {
    expect(reservationBlocksVehicle("pending")).toBe(true)
    expect(reservationBlocksVehicle("confirmed")).toBe(true)
    expect(reservationBlocksVehicle("active")).toBe(true)
  })

  it("treats request, completed, cancelled and no_show as non-blocking", () => {
    expect(reservationBlocksVehicle("request")).toBe(false)
    expect(reservationBlocksVehicle("completed")).toBe(false)
    expect(reservationBlocksVehicle("cancelled")).toBe(false)
    expect(reservationBlocksVehicle("no_show")).toBe(false)
  })
})

describe("isVehicleAvailable", () => {
  const existing: ExistingReservationWindow[] = [
    { id: "r1", vehicleId: "veh_1", status: "confirmed", startDate: "2026-07-10", endDate: "2026-07-15" },
    { id: "r2", vehicleId: "veh_1", status: "cancelled", startDate: "2026-07-20", endDate: "2026-07-25" },
    { id: "r3", vehicleId: "veh_2", status: "active", startDate: "2026-07-10", endDate: "2026-07-15" },
  ]

  it("is unavailable when an overlapping blocking reservation exists", () => {
    expect(isVehicleAvailable("veh_1", { startDate: "2026-07-12", endDate: "2026-07-18" }, existing)).toBe(false)
  })

  it("is available for a non-overlapping window on the same vehicle", () => {
    expect(isVehicleAvailable("veh_1", { startDate: "2026-07-16", endDate: "2026-07-19" }, existing)).toBe(true)
  })

  it("ignores a cancelled reservation even if the dates overlap", () => {
    expect(isVehicleAvailable("veh_1", { startDate: "2026-07-21", endDate: "2026-07-23" }, existing)).toBe(true)
  })

  it("is unaffected by another vehicle's reservations", () => {
    expect(isVehicleAvailable("veh_3", { startDate: "2026-07-12", endDate: "2026-07-14" }, existing)).toBe(true)
  })

  it("excludes the reservation being edited from its own conflict check", () => {
    expect(
      isVehicleAvailable("veh_1", { startDate: "2026-07-10", endDate: "2026-07-15" }, existing, "r1")
    ).toBe(true)
  })
})
