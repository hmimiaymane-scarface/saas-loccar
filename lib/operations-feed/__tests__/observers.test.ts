import { describe, expect, it } from "vitest"

import {
  evaluateIdleVehicle,
  evaluateExpiringDocument,
  evaluateOverlappingReservations,
  findPricingOutliers,
  draftUnusualPricingItem,
  evaluateInactiveHighValueCustomer,
  evaluateVehicleHealthDecline,
  evaluateStaleInspection,
  evaluateMissingHandoffPhotos,
} from "@/lib/operations-feed/observers"

const NOW = new Date("2026-07-21T12:00:00Z")

describe("evaluateIdleVehicle", () => {
  const base = {
    vehicleId: "veh_1",
    make: "Dacia",
    model: "Duster",
    plate: "12345-A-6",
    status: "available" as const,
    lastActivityAt: "2026-07-10T00:00:00Z", // 11 days before NOW
    hasUpcomingReservation: false,
    now: NOW,
  }

  it("flags a vehicle idle past the threshold", () => {
    const result = evaluateIdleVehicle(base)
    expect(result).not.toBeNull()
    expect(result!.priorityTier).toBe("business_health")
    expect(result!.actionHref).toBe("/fleet/veh_1")
  })

  it("escalates to operational once idle for 2x the threshold", () => {
    const result = evaluateIdleVehicle({ ...base, lastActivityAt: "2026-06-01T00:00:00Z" }) // 50 days
    expect(result!.priorityTier).toBe("operational")
  })

  it("produces nothing when idle for fewer days than the threshold", () => {
    expect(evaluateIdleVehicle({ ...base, lastActivityAt: "2026-07-16T00:00:00Z" })).toBeNull() // 5 days
  })

  it("produces nothing when the vehicle isn't available (e.g. in maintenance)", () => {
    expect(evaluateIdleVehicle({ ...base, status: "maintenance" })).toBeNull()
  })

  it("produces nothing when a future reservation is already booked", () => {
    expect(evaluateIdleVehicle({ ...base, hasUpcomingReservation: true })).toBeNull()
  })
})

describe("evaluateExpiringDocument", () => {
  it("is critical when already expired", () => {
    const result = evaluateExpiringDocument({
      documentId: "doc_1",
      categoryLabel: "Insurance",
      expiresOn: "2026-07-15",
      customerId: null,
      vehicleId: "veh_1",
      now: NOW,
    })
    expect(result.priorityTier).toBe("critical")
    expect(result.observation).toContain("expired")
    expect(result.actionHref).toBe("/fleet/veh_1")
  })

  it("is critical when expiring within 3 days", () => {
    const result = evaluateExpiringDocument({
      documentId: "doc_1",
      categoryLabel: "Driving licence",
      expiresOn: "2026-07-23",
      customerId: "cus_1",
      vehicleId: null,
      now: NOW,
    })
    expect(result.priorityTier).toBe("critical")
    expect(result.entityType).toBe("customer")
    expect(result.actionHref).toBe("/customers/cus_1")
  })

  it("is only operational when further out", () => {
    const result = evaluateExpiringDocument({
      documentId: "doc_1",
      categoryLabel: "Registration",
      expiresOn: "2026-08-01",
      customerId: null,
      vehicleId: "veh_1",
      now: NOW,
    })
    expect(result.priorityTier).toBe("operational")
  })
})

describe("evaluateOverlappingReservations", () => {
  it("flags a genuine overlap, keyed to the later-pickup reservation", () => {
    const drafts = evaluateOverlappingReservations("veh_1", [
      { id: "res_a", reference: "RB-1", status: "confirmed", pickupAt: "2026-07-20T10:00:00Z", returnAt: "2026-07-25T10:00:00Z" },
      { id: "res_b", reference: "RB-2", status: "pending", pickupAt: "2026-07-23T10:00:00Z", returnAt: "2026-07-28T10:00:00Z" },
    ])
    expect(drafts).toHaveLength(1)
    expect(drafts[0].entityId).toBe("res_b")
    expect(drafts[0].priorityTier).toBe("critical")
  })

  it("produces nothing for back-to-back, non-overlapping reservations", () => {
    const drafts = evaluateOverlappingReservations("veh_1", [
      { id: "res_a", reference: "RB-1", status: "confirmed", pickupAt: "2026-07-20T10:00:00Z", returnAt: "2026-07-25T10:00:00Z" },
      { id: "res_b", reference: "RB-2", status: "pending", pickupAt: "2026-07-25T10:00:00Z", returnAt: "2026-07-28T10:00:00Z" },
    ])
    expect(drafts).toEqual([])
  })

  it("ignores a cancelled reservation even if its dates would otherwise overlap", () => {
    const drafts = evaluateOverlappingReservations("veh_1", [
      { id: "res_a", reference: "RB-1", status: "cancelled", pickupAt: "2026-07-20T10:00:00Z", returnAt: "2026-07-25T10:00:00Z" },
      { id: "res_b", reference: "RB-2", status: "confirmed", pickupAt: "2026-07-22T10:00:00Z", returnAt: "2026-07-28T10:00:00Z" },
    ])
    expect(drafts).toEqual([])
  })

  it("produces nothing for a single reservation or an empty list", () => {
    expect(evaluateOverlappingReservations("veh_1", [])).toEqual([])
    expect(
      evaluateOverlappingReservations("veh_1", [{ id: "res_a", reference: "RB-1", status: "confirmed", pickupAt: "2026-07-20T10:00:00Z", returnAt: "2026-07-25T10:00:00Z" }])
    ).toEqual([])
  })
})

describe("findPricingOutliers", () => {
  const normalCompact = Array.from({ length: 5 }, (_, i) => ({ reservationId: `r${i}`, reference: `RB-${i}`, dailyRateMad: 300, category: "compact" as const }))

  it("flags a rate far below its category average", () => {
    const outlier = { reservationId: "r_low", reference: "RB-low", dailyRateMad: 150, category: "compact" as const }
    const result = findPricingOutliers([...normalCompact, outlier])
    expect(result).toHaveLength(1)
    expect(result[0].point.reservationId).toBe("r_low")
    expect(result[0].categoryMeanMad).toBe(275) // (300*5+150)/6 = 275
  })

  it("produces nothing when every rate is close to the category average", () => {
    const result = findPricingOutliers([...normalCompact, { reservationId: "r_close", reference: "RB-close", dailyRateMad: 320, category: "compact" as const }])
    expect(result).toEqual([])
  })

  it("produces nothing for a category with too small a sample", () => {
    const result = findPricingOutliers([
      { reservationId: "r1", reference: "RB-1", dailyRateMad: 300, category: "luxury" },
      { reservationId: "r2", reference: "RB-2", dailyRateMad: 900, category: "luxury" }, // huge deviation, but only 2 data points
    ])
    expect(result).toEqual([])
  })
})

describe("draftUnusualPricingItem", () => {
  it("states the direction and magnitude of the deviation correctly", () => {
    const draft = draftUnusualPricingItem(
      { point: { reservationId: "r1", reference: "RB-1", dailyRateMad: 150, category: "compact" }, categoryMeanMad: 300, deviationPercent: 50 },
      "This customer is a first-time renter with no loyalty history, so the discount doesn't have an obvious explanation.",
      "medium"
    )
    expect(draft.observation).toContain("50% below")
    expect(draft.confidence).toBe("medium")
    expect(draft.actionHref).toBe("/reservations/r1")
  })
})

describe("evaluateInactiveHighValueCustomer", () => {
  it("flags a high-value customer", () => {
    const result = evaluateInactiveHighValueCustomer({ customerId: "cus_1", fullName: "Ahmed Tazi", phone: "+212 662-897431", lifetimeRevenueMad: 8000 })
    expect(result).not.toBeNull()
    expect(result!.actionHref).toBe("tel:+212662897431")
  })

  it("produces nothing below the lifetime-revenue threshold", () => {
    expect(evaluateInactiveHighValueCustomer({ customerId: "cus_1", fullName: "Ahmed Tazi", phone: "+212 662-897431", lifetimeRevenueMad: 1000 })).toBeNull()
  })
})

describe("evaluateVehicleHealthDecline", () => {
  const base = { vehicleId: "veh_1", make: "Toyota", model: "Yaris", plate: "1-A-1", healthScore: 30, healthBand: "poor" as const, profitabilityNetMad: -500 }

  it("flags a vehicle with poor health", () => {
    const result = evaluateVehicleHealthDecline({ ...base, profitabilityNetMad: 500 })
    expect(result).not.toBeNull()
    expect(result!.observation).toContain("health score 30/100")
  })

  it("flags a vehicle with negative profitability even if health is fine", () => {
    const result = evaluateVehicleHealthDecline({ ...base, healthScore: 90, healthBand: "excellent", profitabilityNetMad: -200 })
    expect(result).not.toBeNull()
    expect(result!.observation).toContain("negative net profitability")
  })

  it("escalates to operational when health is very low", () => {
    const result = evaluateVehicleHealthDecline({ ...base, healthScore: 10 })
    expect(result!.priorityTier).toBe("operational")
  })

  it("produces nothing for a healthy, profitable vehicle", () => {
    expect(evaluateVehicleHealthDecline({ ...base, healthScore: 90, healthBand: "excellent", profitabilityNetMad: 500 })).toBeNull()
  })
})

describe("evaluateStaleInspection", () => {
  it("flags an inspection open past the threshold", () => {
    const result = evaluateStaleInspection({
      inspectionId: "insp_1",
      reservationId: "res_1",
      reservationReference: "RB-1",
      type: "pickup",
      createdAt: "2026-07-21T06:00:00Z", // 6 hours before NOW
      now: NOW,
    })
    expect(result).not.toBeNull()
    expect(result!.actionHref).toBe("/reservations/res_1/pickup")
  })

  it("produces nothing for a recently started inspection", () => {
    expect(
      evaluateStaleInspection({ inspectionId: "insp_1", reservationId: "res_1", reservationReference: "RB-1", type: "return", createdAt: "2026-07-21T11:00:00Z", now: NOW })
    ).toBeNull()
  })

  it("routes a return inspection to the return workflow", () => {
    const result = evaluateStaleInspection({
      inspectionId: "insp_1",
      reservationId: "res_1",
      reservationReference: "RB-1",
      type: "return",
      createdAt: "2026-07-21T06:00:00Z",
      now: NOW,
    })
    expect(result!.actionHref).toBe("/reservations/res_1/return")
  })
})

describe("evaluateMissingHandoffPhotos", () => {
  it("flags a missing fuel-gauge photo", () => {
    const result = evaluateMissingHandoffPhotos({
      inspectionId: "insp_1",
      reservationId: "res_1",
      reservationReference: "RB-1",
      type: "return",
      capturedSlots: ["front", "rear", "dashboard_odometer"],
    })
    expect(result).not.toBeNull()
    expect(result!.observation).toContain("fuel level")
  })

  it("names both when both are missing", () => {
    const result = evaluateMissingHandoffPhotos({ inspectionId: "insp_1", reservationId: "res_1", reservationReference: "RB-1", type: "return", capturedSlots: ["front"] })
    expect(result!.observation).toContain("fuel level and odometer")
  })

  it("produces nothing when both required photos are present", () => {
    expect(
      evaluateMissingHandoffPhotos({ inspectionId: "insp_1", reservationId: "res_1", reservationReference: "RB-1", type: "return", capturedSlots: ["fuel_gauge", "dashboard_odometer"] })
    ).toBeNull()
  })
})
