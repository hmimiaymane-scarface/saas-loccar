import { describe, expect, it, vi, beforeEach } from "vitest"

const askAiMock = vi.hoisted(() => ({ askAI: vi.fn() }))
vi.mock("@/lib/ai/service", () => askAiMock)

import { generateVehicleRecommendations } from "@/lib/vehicle-recommendations"
import type { SessionContext } from "@/lib/auth/session"
import type { VehicleHealthResult, VehicleProfitabilityResult, VehicleUtilizationResult } from "@/lib/vehicle-intelligence"

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

const health: VehicleHealthResult = {
  score: 42,
  band: "fair",
  factors: [{ key: "damage", label: "Damage history", score: 70, weight: 25 }],
}

const profitability: VehicleProfitabilityResult = {
  netMad: 5500,
  breakdown: [
    { label: "Rental income", amountMad: 10000, direction: "in" },
    { label: "Maintenance", amountMad: 1500, direction: "out" },
  ],
}

const utilization: VehicleUtilizationResult = {
  occupancyRatePercent: 60,
  idleDays: 40,
  reservationCount: 8,
  revenuePerDayMad: 200,
  weekdayVsWeekend: null,
}

beforeEach(() => {
  askAiMock.askAI.mockReset()
})

describe("generateVehicleRecommendations", () => {
  it("calls askAI with the right purpose, allowed roles, and a prompt grounded in the given data", async () => {
    askAiMock.askAI.mockResolvedValue({
      ok: true,
      data: { recommendations: [{ observation: "Frequent damage.", reasoning: "70/100 damage score.", suggestedAction: "Inspect before next rental." }] },
      confidence: "high",
      modelId: "claude-sonnet-5",
    })

    const result = await generateVehicleRecommendations(
      {} as never,
      makeSession(),
      "Dacia Duster (12345-A-6)",
      health,
      profitability,
      utilization
    )

    expect(askAiMock.askAI).toHaveBeenCalledTimes(1)
    const call = askAiMock.askAI.mock.calls[0][2]
    expect(call.purpose).toBe("vehicle.recommend")
    expect(call.allowedRoles).toEqual(["owner", "manager", "agent"])
    expect(call.prompt).toContain("Dacia Duster (12345-A-6)")
    expect(call.prompt).toContain("42/100 (fair)")
    expect(call.prompt).toContain("Damage history: 70/100 (weight 25)")
    expect(call.prompt).toContain("5500 MAD")
    expect(call.prompt).toContain("Rental income: +10000 MAD")
    expect(call.prompt).toContain("Maintenance: -1500 MAD")
    expect(call.prompt).toContain("60% occupancy")

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.recommendations).toHaveLength(1)
  })

  it("passes through a failed askAI result unchanged", async () => {
    askAiMock.askAI.mockResolvedValue({ ok: false, error: "provider_not_configured", message: "No AI provider is configured." })

    const result = await generateVehicleRecommendations(
      {} as never,
      makeSession(),
      "Dacia Duster (12345-A-6)",
      health,
      profitability,
      utilization
    )

    expect(result).toEqual({ ok: false, error: "provider_not_configured", message: "No AI provider is configured." })
  })
})
