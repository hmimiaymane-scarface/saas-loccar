import { describe, expect, it, vi, beforeEach } from "vitest"

const insightsMock = vi.hoisted(() => ({ generateVehicleInsights: vi.fn() }))
vi.mock("@/lib/vehicle-recommendations", () => insightsMock)

import {
  recomputeVehicleIntelligence,
  recomputeVehicleIntelligenceBestEffort,
  getVehicleIntelligence,
} from "@/lib/vehicle-intelligence-store"
import type { SessionContext } from "@/lib/auth/session"

function makeSession(role: SessionContext["role"] = "manager"): SessionContext {
  return {
    userId: "user-1",
    email: "manager@atlas.test",
    profile: { fullName: "Manager Person", avatarPath: null, phone: null, preferredLanguage: "en" },
    company: {
      id: "co_1",
      name: "Atlas Rent Car",
      slug: "atlas",
      city: "Marrakech",
      country: "Morocco",
      currency: "MAD",
      timezone: "Africa/Casablanca",
      status: "active",
      maintenanceReminderDays: 14,
      documentExpiryWarningDays: 30,
      agentsCanRecordExpenses: false,
      mutedNotificationTypes: [],
    },
    role,
  }
}

function chainable(result: { data: unknown; error: unknown }) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        const promise = Promise.resolve(result)
        return promise.then.bind(promise)
      }
      return () => proxy
    },
  }
  const proxy = new Proxy({}, handler)
  return proxy
}

const VEHICLE_ROW = {
  make: "Dacia",
  model: "Duster",
  registration_number: "12345-A-6",
  year: 2020,
  odometer_km: 50_000,
  daily_rate: 300,
  acquired_on: "2024-01-01",
  insurance_expires_on: "2027-01-01",
  registration_expires_on: "2027-01-01",
  inspection_expires_on: "2027-01-01",
}

function makeFakeSupabase(
  overrides: Partial<Record<string, { data: unknown; error: unknown }>> = {},
  upsertResult: { error: unknown } = { error: null }
) {
  const upserts: { table: string; row: Record<string, unknown>; options: unknown }[] = []
  const responses: Record<string, { data: unknown; error: unknown }> = {
    vehicles: { data: VEHICLE_ROW, error: null },
    maintenance_records: { data: [], error: null },
    damages: { data: [], error: null },
    inspections: { data: [], error: null },
    reservations: { data: [], error: null },
    expenses: { data: [], error: null },
    payments: { data: [], error: null },
    vehicle_intelligence: { data: null, error: null },
    ...overrides,
  }

  const client = {
    from(table: string) {
      if (table === "vehicle_intelligence") {
        return {
          select: () => chainable(responses.vehicle_intelligence),
          upsert(row: Record<string, unknown>, options: unknown) {
            upserts.push({ table, row, options })
            return Promise.resolve(upsertResult)
          },
        }
      }
      return chainable(responses[table] ?? { data: [], error: null })
    },
  }

  return { client, upserts }
}

beforeEach(() => {
  insightsMock.generateVehicleInsights.mockReset()
  insightsMock.generateVehicleInsights.mockResolvedValue({
    ok: true,
    data: { summary: "All good.", recommendations: [{ observation: "o", reasoning: "r", suggestedAction: "a" }] },
    confidence: "high",
    modelId: "claude-sonnet-5",
  })
})

describe("recomputeVehicleIntelligence", () => {
  it("returns null when the vehicle doesn't exist in this company", async () => {
    const { client } = makeFakeSupabase({ vehicles: { data: null, error: null } })
    const result = await recomputeVehicleIntelligence(client as never, makeSession(), "veh-1", "vehicle_returned")
    expect(result).toBeNull()
    expect(insightsMock.generateVehicleInsights).not.toHaveBeenCalled()
  })

  it("computes scores, generates recommendations, and upserts the cache row", async () => {
    const { client, upserts } = makeFakeSupabase({
      damages: { data: [{ status: "repaired", severity: "minor", pre_existing: false, actual_cost: 200, estimated_cost: 150 }], error: null },
      expenses: { data: [{ category: "maintenance", amount: 500 }], error: null },
    })

    const result = await recomputeVehicleIntelligence(client as never, makeSession(), "veh-1", "vehicle_returned")

    expect(result).not.toBeNull()
    expect(result?.health.score).toEqual(expect.any(Number))
    expect(result?.profitability.breakdown.find((b) => b.label === "Damage repairs")?.amountMad).toBe(200)
    expect(result?.summary).toBe("All good.")
    expect(result?.recommendations).toEqual([{ observation: "o", reasoning: "r", suggestedAction: "a" }])
    expect(result?.recommendationsConfidence).toBe("high")
    expect(result?.computedReason).toBe("vehicle_returned")

    expect(upserts).toHaveLength(1)
    expect(upserts[0].options).toEqual({ onConflict: "company_id,vehicle_id" })
    expect(upserts[0].row).toMatchObject({
      company_id: "co_1",
      vehicle_id: "veh-1",
      computed_reason: "vehicle_returned",
      summary: "All good.",
      recommendations_confidence: "high",
    })

    expect(insightsMock.generateVehicleInsights).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ role: "manager" }),
      "Dacia Duster (12345-A-6)",
      expect.objectContaining({ score: expect.any(Number) }),
      expect.objectContaining({ netMad: expect.any(Number) }),
      expect.objectContaining({ occupancyRatePercent: expect.any(Number) })
    )
  })

  it("still computes and caches scores when recommendation generation fails", async () => {
    insightsMock.generateVehicleInsights.mockResolvedValue({
      ok: false,
      error: "provider_not_configured",
      message: "No AI provider is configured.",
    })
    const { client, upserts } = makeFakeSupabase()

    const result = await recomputeVehicleIntelligence(client as never, makeSession(), "veh-1", "maintenance_completed")

    expect(result).not.toBeNull()
    expect(result?.summary).toBeNull()
    expect(result?.recommendations).toBeNull()
    expect(result?.recommendationsConfidence).toBeNull()
    expect(upserts[0].row).toMatchObject({ summary: null, recommendations: null, recommendations_confidence: null })
  })

  it("throws when the upsert fails", async () => {
    const { client } = makeFakeSupabase({}, { error: { message: "constraint violation" } })
    await expect(recomputeVehicleIntelligence(client as never, makeSession(), "veh-1", "damage_recorded")).rejects.toBeTruthy()
  })
})

describe("recomputeVehicleIntelligenceBestEffort", () => {
  it("swallows an error instead of throwing", async () => {
    const { client } = makeFakeSupabase({}, { error: { message: "constraint violation" } })
    await expect(
      recomputeVehicleIntelligenceBestEffort(client as never, makeSession(), "veh-1", "damage_recorded")
    ).resolves.toBeUndefined()
  })
})

describe("getVehicleIntelligence", () => {
  it("returns the cached row, mapped, without recomputing", async () => {
    const cachedRow = {
      health_score: 80,
      health_band: "good",
      health_factors: [{ key: "damage", label: "Damage history", score: 100, weight: 25 }],
      profitability_net_mad: 4200,
      profitability_breakdown: [{ label: "Rental income", amountMad: 5000, direction: "in" }],
      utilization: { occupancyRatePercent: 50, idleDays: 10, reservationCount: 3, revenuePerDayMad: 150, weekdayVsWeekend: null },
      summary: "Cached summary.",
      recommendations: null,
      recommendations_confidence: null,
      computed_reason: "vehicle_returned",
      computed_at: "2026-07-27T00:00:00.000Z",
    }
    const { client } = makeFakeSupabase({ vehicle_intelligence: { data: cachedRow, error: null } })

    const result = await getVehicleIntelligence(client as never, makeSession(), "veh-1")

    expect(result).toEqual({
      health: { score: 80, band: "good", factors: cachedRow.health_factors },
      profitability: { netMad: 4200, breakdown: cachedRow.profitability_breakdown },
      utilization: cachedRow.utilization,
      summary: "Cached summary.",
      recommendations: null,
      recommendationsConfidence: null,
      computedReason: "vehicle_returned",
      computedAt: "2026-07-27T00:00:00.000Z",
    })
    expect(insightsMock.generateVehicleInsights).not.toHaveBeenCalled()
  })

  it("lazily computes and caches when nothing has been computed yet", async () => {
    const { client, upserts } = makeFakeSupabase({ vehicle_intelligence: { data: null, error: null } })

    const result = await getVehicleIntelligence(client as never, makeSession(), "veh-1")

    expect(result).not.toBeNull()
    expect(result?.computedReason).toBe("initial_view")
    expect(upserts).toHaveLength(1)
  })
})
