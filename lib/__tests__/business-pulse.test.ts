import { describe, expect, it } from "vitest"

import {
  computeFleetPulse,
  computeCustomerPulse,
  computeReservationsPulse,
  computeRevenuePulse,
  computeMaintenancePulse,
  computeCashFlowPulse,
  computeDocumentsPulse,
  computeTeamPulse,
  computeBusinessPulse,
} from "@/lib/business-pulse"

describe("computeFleetPulse", () => {
  it("is Healthy at 70+, Needs Attention 40-69, Critical below 40 — same bands as lib/tone.ts#scoreBand", () => {
    expect(computeFleetPulse(85, 10)).toEqual({ label: "Healthy", tone: "positive" })
    expect(computeFleetPulse(55, 10)).toEqual({ label: "Needs Attention", tone: "warning" })
    expect(computeFleetPulse(20, 10)).toEqual({ label: "Critical", tone: "critical" })
  })
  it("roadmap phase 53 — a zero vehicle count reads as 'No vehicles yet', not Critical, even though the average score of an empty set is also 0", () => {
    expect(computeFleetPulse(0, 0)).toEqual({ label: "No vehicles yet", tone: "neutral" })
  })
})

describe("computeCustomerPulse", () => {
  it("is Growing when new customers are up more than 10%", () => {
    expect(computeCustomerPulse(23, 20)).toEqual({ label: "Growing", tone: "positive" })
  })
  it("is Declining when down more than 10%", () => {
    expect(computeCustomerPulse(16, 20)).toEqual({ label: "Declining", tone: "warning" })
  })
  it("is Stable within the 10% band", () => {
    expect(computeCustomerPulse(21, 20)).toEqual({ label: "Stable", tone: "neutral" })
  })
  it("treats zero last month with some this month as growth, not a divide-by-zero crash", () => {
    expect(computeCustomerPulse(5, 0)).toEqual({ label: "Growing", tone: "positive" })
  })
  it("treats zero and zero as stable, not growth", () => {
    expect(computeCustomerPulse(0, 0)).toEqual({ label: "Stable", tone: "neutral" })
  })
})

describe("computeReservationsPulse", () => {
  it("is Above average / Below average / Average around the trailing baseline", () => {
    expect(computeReservationsPulse(50, 40)).toEqual({ label: "Above average", tone: "positive" })
    expect(computeReservationsPulse(30, 40)).toEqual({ label: "Below average", tone: "warning" })
    expect(computeReservationsPulse(41, 40)).toEqual({ label: "Average", tone: "neutral" })
  })
})

describe("computeRevenuePulse", () => {
  it("Declining is a critical tone, not just a warning — revenue drop is the one category with real financial stakes", () => {
    expect(computeRevenuePulse(80_000, 100_000)).toEqual({ label: "Declining", tone: "critical" })
  })
  it("Growing and Stable", () => {
    expect(computeRevenuePulse(120_000, 100_000)).toEqual({ label: "Growing", tone: "positive" })
    expect(computeRevenuePulse(102_000, 100_000)).toEqual({ label: "Stable", tone: "neutral" })
  })
})

describe("computeMaintenancePulse", () => {
  it("On track only at exactly zero due/overdue", () => {
    expect(computeMaintenancePulse(0)).toEqual({ label: "On track", tone: "positive" })
    expect(computeMaintenancePulse(1)).toEqual({ label: "Attention required", tone: "warning" })
  })
})

describe("computeCashFlowPulse", () => {
  it("Healthy at or under 15% of monthly revenue outstanding", () => {
    expect(computeCashFlowPulse(14_000, 100_000)).toEqual({ label: "Healthy", tone: "positive" })
    expect(computeCashFlowPulse(15_000, 100_000)).toEqual({ label: "Healthy", tone: "positive" })
  })
  it("Needs attention above the 15% threshold", () => {
    expect(computeCashFlowPulse(20_000, 100_000)).toEqual({ label: "Needs attention", tone: "warning" })
  })
  it("zero revenue with zero outstanding is healthy, not a divide-by-zero crash", () => {
    expect(computeCashFlowPulse(0, 0)).toEqual({ label: "Healthy", tone: "positive" })
  })
  it("zero revenue with real outstanding balance needs attention", () => {
    expect(computeCashFlowPulse(500, 0)).toEqual({ label: "Needs attention", tone: "warning" })
  })
})

describe("computeDocumentsPulse", () => {
  it("All current at zero, otherwise names the count", () => {
    expect(computeDocumentsPulse(0)).toEqual({ label: "All current", tone: "positive" })
    expect(computeDocumentsPulse(1)).toEqual({ label: "1 expiring", tone: "warning" })
    expect(computeDocumentsPulse(3)).toEqual({ label: "3 expiring", tone: "warning" })
  })
})

describe("computeTeamPulse", () => {
  it("is purely factual, no judgment tone even with pending invitations", () => {
    expect(computeTeamPulse(5, 0)).toEqual({ label: "5 active", tone: "neutral" })
    expect(computeTeamPulse(5, 2)).toEqual({ label: "5 active, 2 pending", tone: "neutral" })
  })
})

describe("computeBusinessPulse", () => {
  it("assembles all eight categories from one input bag", () => {
    const result = computeBusinessPulse({
      averageFleetHealthScore: 85,
      fleetVehicleCount: 10,
      newCustomersThisMonth: 10,
      newCustomersLastMonth: 10,
      reservationsThisMonth: 40,
      reservationsTrailingAverage: 40,
      revenueThisMonthMad: 100_000,
      revenueLastMonthMad: 90_000,
      maintenanceDueOrOverdueCount: 0,
      outstandingBalanceMad: 5_000,
      documentsExpiringCount: 1,
      activeTeamCount: 4,
      pendingInvitationsCount: 1,
    })
    expect(result.fleet.label).toBe("Healthy")
    expect(result.customers.label).toBe("Stable")
    expect(result.reservations.label).toBe("Average")
    expect(result.revenue.label).toBe("Growing")
    expect(result.maintenance.label).toBe("On track")
    expect(result.cashFlow.label).toBe("Healthy")
    expect(result.documents.label).toBe("1 expiring")
    expect(result.team.label).toBe("4 active, 1 pending")
  })
})
