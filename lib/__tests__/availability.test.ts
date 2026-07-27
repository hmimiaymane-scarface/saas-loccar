import { describe, expect, it } from "vitest"

import {
  periodsOverlap,
  isVehicleAvailable,
  reservationBlocksVehicle,
  findConflictingReservation,
  findNextReservationAfter,
  hoursBetween,
} from "../availability"
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

describe("findConflictingReservation", () => {
  const existing: ExistingReservationWindow[] = [
    { id: "r1", vehicleId: "veh_1", status: "confirmed", startDate: "2026-07-10", endDate: "2026-07-15" },
    { id: "r2", vehicleId: "veh_1", status: "cancelled", startDate: "2026-07-20", endDate: "2026-07-25" },
  ]

  it("returns the specific blocking reservation for an overlapping window", () => {
    expect(findConflictingReservation("veh_1", { startDate: "2026-07-12", endDate: "2026-07-18" }, existing)?.id).toBe("r1")
  })

  it("ignores a cancelled reservation even if the dates overlap", () => {
    expect(findConflictingReservation("veh_1", { startDate: "2026-07-21", endDate: "2026-07-23" }, existing)).toBeNull()
  })

  it("returns null for a non-overlapping window", () => {
    expect(findConflictingReservation("veh_1", { startDate: "2026-07-16", endDate: "2026-07-19" }, existing)).toBeNull()
  })
})

describe("findNextReservationAfter", () => {
  const existing: ExistingReservationWindow[] = [
    { id: "r1", vehicleId: "veh_1", status: "confirmed", startDate: "2026-07-20", endDate: "2026-07-25" },
    { id: "r2", vehicleId: "veh_1", status: "confirmed", startDate: "2026-08-01", endDate: "2026-08-05" },
    { id: "r3", vehicleId: "veh_1", status: "cancelled", startDate: "2026-07-16", endDate: "2026-07-18" },
  ]

  it("returns the closest upcoming reservation after the given date", () => {
    expect(findNextReservationAfter("veh_1", "2026-07-16", existing)?.id).toBe("r1")
  })

  it("ignores a cancelled reservation", () => {
    expect(findNextReservationAfter("veh_1", "2026-07-10", existing)?.id).toBe("r1")
  })

  it("returns null when nothing is scheduled after the given date", () => {
    expect(findNextReservationAfter("veh_1", "2026-08-10", existing)).toBeNull()
  })

  it("excludes the reservation being edited", () => {
    expect(findNextReservationAfter("veh_1", "2026-07-16", existing, "r1")?.id).toBe("r2")
  })
})

describe("hoursBetween", () => {
  it("computes the hours between two timestamps", () => {
    expect(hoursBetween("2026-07-20T10:00:00Z", "2026-07-21T10:00:00Z")).toBe(24)
  })

  it("is always non-negative regardless of argument order", () => {
    expect(hoursBetween("2026-07-21T10:00:00Z", "2026-07-20T10:00:00Z")).toBe(24)
  })
})
