import { describe, expect, it, vi, beforeEach } from "vitest"

const askAiMock = vi.hoisted(() => ({ askAI: vi.fn() }))
vi.mock("@/lib/ai/service", () => askAiMock)

import { generateCustomerSummary } from "@/lib/customer-summary"
import type { SessionContext } from "@/lib/auth/session"
import type { TrustScoreResult, CustomerLifetimeValueResult } from "@/lib/customer-intelligence"

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
      logoUrl: null,
      email: null,
      address: null,
      defaultDepositMad: null,
      overdueGracePeriodHours: 0,
    },
    role,
  }
}

const trust: TrustScoreResult = {
  score: 85,
  band: "excellent",
  factors: [{ key: "rental_history", label: "Successful rentals", score: 60, weight: 20 }],
}

const clv: CustomerLifetimeValueResult = {
  lifetimeRevenueMad: 15_000,
  rentalFrequencyPerYear: 6,
  averageReservationMad: 3_000,
  expectedFutureValueMad: 18_000,
  preferredCategory: "suv",
}

beforeEach(() => {
  askAiMock.askAI.mockReset()
})

describe("generateCustomerSummary", () => {
  it("calls askAI with the right purpose, allowed roles, and a prompt grounded in the given data", async () => {
    askAiMock.askAI.mockResolvedValue({
      ok: true,
      data: { summary: "A reliable, frequent SUV renter." },
      confidence: "high",
      modelId: "claude-sonnet-5",
    })

    const result = await generateCustomerSummary({} as never, makeSession(), "Ahmed Tazi", trust, clv)

    expect(askAiMock.askAI).toHaveBeenCalledTimes(1)
    const call = askAiMock.askAI.mock.calls[0][2]
    expect(call.purpose).toBe("customer.summarize")
    expect(call.allowedRoles).toEqual(["owner", "manager", "agent", "accountant"])
    expect(call.prompt).toContain("Ahmed Tazi")
    expect(call.prompt).toContain("85/100 (excellent)")
    expect(call.prompt).toContain("Successful rentals: 60/100 (weight 20)")
    expect(call.prompt).toContain("15000 MAD")
    expect(call.prompt).toContain("6 per year")
    expect(call.prompt).toContain("suv")

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.summary).toBe("A reliable, frequent SUV renter.")
  })

  it("passes through a failed askAI result unchanged", async () => {
    askAiMock.askAI.mockResolvedValue({ ok: false, error: "provider_not_configured", message: "No AI provider is configured." })

    const result = await generateCustomerSummary({} as never, makeSession(), "Ahmed Tazi", trust, clv)

    expect(result).toEqual({ ok: false, error: "provider_not_configured", message: "No AI provider is configured." })
  })
})
