import { describe, expect, it } from "vitest"

import { buildReturnCompletionSummary } from "@/lib/reservations/completion-summary"
import type { Damage, Deposit, Inspection, ReservationDetail } from "@/types/rental"

function makeInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: "insp_1",
    reservationId: "res_1",
    vehicleId: "veh_1",
    customerId: "cus_1",
    type: "return",
    status: "completed",
    performedByName: "Ahmed",
    odometerKm: 45000,
    fuelLevel: "full",
    cleanliness: "clean",
    overallCondition: "good",
    notes: null,
    customerAcknowledged: true,
    existingDamageReviewed: true,
    completedAt: "2026-07-24T10:00:00.000Z",
    correctionReason: null,
    correctedAt: null,
    createdAt: "2026-07-24T09:00:00.000Z",
    checklist: [],
    media: [],
    ...overrides,
  }
}

function makeDamage(overrides: Partial<Damage> = {}): Damage {
  return {
    id: "dmg_1",
    vehicleId: "veh_1",
    vehicleLabel: "Dacia Duster",
    reservationId: "res_1",
    reservationReference: "RB-1",
    discoveredInInspectionId: null,
    status: "newly_discovered",
    category: "bodywork",
    vehicleArea: "rear bumper",
    severity: "minor",
    description: "Scratch",
    preExisting: false,
    estimatedCostMad: null,
    actualCostMad: null,
    createdByName: null,
    createdAt: "2026-07-24T10:00:00.000Z",
    media: [],
    source: "manual",
    aiConfidence: null,
    ...overrides,
  }
}

function makeDeposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: "dep_1",
    reservationId: "res_1",
    status: "returned",
    expectedMad: 2000,
    collectedMad: 2000,
    returnedMad: 2000,
    retainedMad: 0,
    method: "cash",
    collectedAt: "2026-07-20T10:00:00.000Z",
    returnedAt: "2026-07-24T10:00:00.000Z",
    notes: null,
    ...overrides,
  }
}

function makeReservation(overrides: Partial<ReservationDetail> = {}): ReservationDetail {
  return {
    id: "res_1",
    reference: "RB-1",
    customer: { id: "cus_1", fullName: "Ahmed Tazi", phone: "0600000000" },
    vehicle: { id: "veh_1", make: "Dacia", model: "Duster", plate: "1234-A-5", category: "suv" },
    requestedCategory: null,
    startDate: "2026-07-20",
    endDate: "2026-07-24",
    pickupLocation: "Agency",
    returnLocation: "Agency",
    status: "completed",
    isOverdue: false,
    payment: { status: "paid", totalDueMad: 1600, amountPaidMad: 1600, remainingMad: 0 },
    createdAt: "2026-07-18T09:00:00.000Z",
    pickupAt: "2026-07-20T10:00:00.000Z",
    returnAt: "2026-07-24T10:00:00.000Z",
    branchId: null,
    branchName: null,
    customerDetail: { id: "cus_1", fullName: "Ahmed Tazi", phone: "0600000000" },
    source: "walk_in",
    dailyRateMad: 400,
    numDays: 4,
    discountMad: 0,
    notes: null,
    createdByName: null,
    activity: [],
    deposit: makeDeposit(),
    pickupInspection: makeInspection({ id: "insp_pickup", type: "pickup" }),
    returnInspection: makeInspection(),
    documents: [],
    damages: [],
    payments: [],
    assignedEmployeeId: null,
    ...overrides,
  }
}

describe("buildReturnCompletionSummary", () => {
  it("computes the actual pickup->return span when a return inspection completed", () => {
    const result = buildReturnCompletionSummary(makeReservation())
    expect(result.durationDays).toBe(4)
    expect(result.durationIsActual).toBe(true)
  })

  it("falls back to the booked numDays when there's no completed return inspection", () => {
    const result = buildReturnCompletionSummary(makeReservation({ returnInspection: null, numDays: 5 }))
    expect(result.durationDays).toBe(5)
    expect(result.durationIsActual).toBe(false)
  })

  it("reports revenue and remaining balance straight from the payment summary", () => {
    const result = buildReturnCompletionSummary(
      makeReservation({ payment: { status: "partial", totalDueMad: 2000, amountPaidMad: 1500, remainingMad: 500 } })
    )
    expect(result.revenueMad).toBe(2000)
    expect(result.remainingMad).toBe(500)
  })

  it("phrases a fully-returned deposit as positive", () => {
    const result = buildReturnCompletionSummary(makeReservation({ deposit: makeDeposit({ status: "returned", returnedMad: 2000 }) }))
    expect(result.depositResult).toEqual({ label: "2000 MAD returned in full", tone: "positive" })
  })

  it("phrases a retained deposit as a warning", () => {
    const result = buildReturnCompletionSummary(
      makeReservation({ deposit: makeDeposit({ status: "retained", retainedMad: 800, returnedMad: 0 }) })
    )
    expect(result.depositResult).toEqual({ label: "800 MAD retained", tone: "warning" })
  })

  it("phrases a partially-returned deposit with both amounts", () => {
    const result = buildReturnCompletionSummary(
      makeReservation({ deposit: makeDeposit({ status: "partially_returned", returnedMad: 1200, retainedMad: 800 }) })
    )
    expect(result.depositResult).toEqual({ label: "1200 MAD returned, 800 MAD retained", tone: "warning" })
  })

  it("phrases an unresolved deposit status plainly", () => {
    const result = buildReturnCompletionSummary(makeReservation({ deposit: makeDeposit({ status: "collected" }) }))
    expect(result.depositResult).toEqual({ label: "Not yet resolved", tone: "warning" })
  })

  it("reports no deposit required when none exists", () => {
    const result = buildReturnCompletionSummary(makeReservation({ deposit: null }))
    expect(result.depositResult).toEqual({ label: "No deposit required", tone: "neutral" })
  })

  it("labels vehicle state with condition only when there's no new damage", () => {
    const result = buildReturnCompletionSummary(makeReservation({ returnInspection: makeInspection({ overallCondition: "good" }) }))
    expect(result.vehicleStateLabel).toBe("Good condition")
  })

  it("appends a new-damage count to the vehicle state label", () => {
    const result = buildReturnCompletionSummary(
      makeReservation({
        returnInspection: makeInspection({ overallCondition: "fair" }),
        damages: [makeDamage({ preExisting: false }), makeDamage({ id: "dmg_2", preExisting: true })],
      })
    )
    expect(result.vehicleStateLabel).toBe("Fair condition — 1 new damage noted")
  })

  it("pluralizes multiple new damages", () => {
    const result = buildReturnCompletionSummary(
      makeReservation({
        returnInspection: makeInspection({ overallCondition: "poor" }),
        damages: [makeDamage({ id: "dmg_1", preExisting: false }), makeDamage({ id: "dmg_2", preExisting: false })],
      })
    )
    expect(result.vehicleStateLabel).toBe("Poor condition — 2 new damages noted")
  })

  it("reports condition not recorded when there's no return inspection", () => {
    const result = buildReturnCompletionSummary(makeReservation({ returnInspection: null }))
    expect(result.vehicleStateLabel).toBe("Condition not recorded")
  })
})
