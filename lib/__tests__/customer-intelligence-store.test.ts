import { describe, expect, it, vi, beforeEach } from "vitest"

const summaryMock = vi.hoisted(() => ({ generateCustomerSummary: vi.fn() }))
vi.mock("@/lib/customer-summary", () => summaryMock)

import {
  recomputeCustomerIntelligence,
  recomputeCustomerIntelligenceBestEffort,
  getCustomerIntelligence,
} from "@/lib/customer-intelligence-store"
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
      logoUrl: null,
      email: null,
      address: null,
      defaultDepositMad: null,
      overdueGracePeriodHours: 0,
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

const CUSTOMER_ROW = { full_name: "Ahmed Tazi", created_at: "2024-01-01T00:00:00.000Z" }

const RESERVATIONS = [
  {
    id: "res_1",
    status: "completed",
    pickup_at: "2025-02-01T00:00:00.000Z",
    return_at: "2025-02-05T00:00:00.000Z",
    remaining_balance: 0,
    vehicle: { category: "suv" },
  },
  {
    id: "res_2",
    status: "completed",
    pickup_at: "2025-03-01T00:00:00.000Z",
    return_at: "2025-03-05T00:00:00.000Z",
    remaining_balance: 100,
    vehicle: { category: "suv" },
  },
]

const PAYMENTS = [
  { transaction_type: "rental_payment", amount: 5000 },
  { transaction_type: "rental_payment", amount: 3000 },
  { transaction_type: "refund", amount: 500 },
]

const DAMAGES = [{ pre_existing: false }]
const DEPOSITS = [{ status: "disputed", retained_amount: 0 }]
const RETURNED_EVENTS = [
  { metadata: { reservation_id: "res_1" }, created_at: "2025-02-05T00:00:00.000Z" }, // on time
  { metadata: { reservation_id: "res_2" }, created_at: "2025-03-07T00:00:00.000Z" }, // 2 days late
]

function makeFakeSupabase(overrides: Partial<Record<string, { data: unknown; error: unknown }>> = {}, upsertResult: { error: unknown } = { error: null }) {
  const upserts: { table: string; row: Record<string, unknown>; options: unknown }[] = []
  const responses: Record<string, { data: unknown; error: unknown }> = {
    customers: { data: CUSTOMER_ROW, error: null },
    documents: { data: [{ id: "doc_1" }], error: null },
    reservations: { data: RESERVATIONS, error: null },
    payments: { data: PAYMENTS, error: null },
    damages: { data: DAMAGES, error: null },
    deposits: { data: DEPOSITS, error: null },
    activity_log: { data: RETURNED_EVENTS, error: null },
    customer_intelligence: { data: null, error: null },
    ...overrides,
  }

  const client = {
    from(table: string) {
      if (table === "customer_intelligence") {
        return {
          select: () => chainable(responses.customer_intelligence),
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

const now = new Date("2025-08-01T00:00:00.000Z")

beforeEach(() => {
  summaryMock.generateCustomerSummary.mockReset()
  summaryMock.generateCustomerSummary.mockResolvedValue({
    ok: true,
    data: { summary: "A reliable, frequent SUV renter." },
    confidence: "high",
    modelId: "claude-sonnet-5",
  })
})

describe("recomputeCustomerIntelligence", () => {
  it("returns null when the customer doesn't exist in this company", async () => {
    const { client } = makeFakeSupabase({ customers: { data: null, error: null } })
    const result = await recomputeCustomerIntelligence(client as never, makeSession(), "cus_1", "payment_recorded", now)
    expect(result).toBeNull()
    expect(summaryMock.generateCustomerSummary).not.toHaveBeenCalled()
  })

  it("computes trust score and CLV correctly from a full fixture (hand-computed) and upserts the cache row", async () => {
    const { client, upserts } = makeFakeSupabase()

    const result = await recomputeCustomerIntelligence(client as never, makeSession(), "cus_1", "vehicle_returned", now)

    expect(result).not.toBeNull()

    // hasVerifiedIdentity=true, successfulRentals=2, lateReturns=1/2,
    // damages=1, outstandingBalanceIncidents=1 (res_2), depositIssues=1
    // (disputed) -> identity=100*20 + rentalHistory=40*20 + lateReturns=50*15
    // + damage=80*15 + payment=75*15 + deposit=70*15, /100 = 69.25 -> 69
    expect(result?.trust.score).toBe(69)
    expect(result?.trust.band).toBe("good")

    // netRevenue = 5000+3000-500 = 7500; reservationCount=2;
    // tenureMonths = (Aug1 - Feb1) / 30.44d = 5.95;
    // frequency = round(2/(5.95/12)) = 4.03; average = 3750;
    // expectedFutureValue = round(3750*4.03) = 15112.5
    expect(result?.clv.lifetimeRevenueMad).toBe(7500)
    expect(result?.clv.rentalFrequencyPerYear).toBe(4.03)
    expect(result?.clv.averageReservationMad).toBe(3750)
    expect(result?.clv.expectedFutureValueMad).toBe(15112.5)
    expect(result?.clv.preferredCategory).toBe("suv")

    expect(result?.summary).toBe("A reliable, frequent SUV renter.")
    expect(result?.computedReason).toBe("vehicle_returned")

    expect(upserts).toHaveLength(1)
    expect(upserts[0].options).toEqual({ onConflict: "company_id,customer_id" })
    expect(upserts[0].row).toMatchObject({
      company_id: "co_1",
      customer_id: "cus_1",
      trust_score: 69,
      trust_band: "good",
      preferred_category: "suv",
      computed_reason: "vehicle_returned",
    })

    expect(summaryMock.generateCustomerSummary).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ role: "manager" }),
      "Ahmed Tazi",
      expect.objectContaining({ score: 69 }),
      expect.objectContaining({ lifetimeRevenueMad: 7500 })
    )
  })

  it("still computes and caches scores when summary generation fails", async () => {
    summaryMock.generateCustomerSummary.mockResolvedValue({
      ok: false,
      error: "provider_not_configured",
      message: "No AI provider is configured.",
    })
    const { client, upserts } = makeFakeSupabase()

    const result = await recomputeCustomerIntelligence(client as never, makeSession(), "cus_1", "payment_recorded", now)

    expect(result).not.toBeNull()
    expect(result?.summary).toBeNull()
    expect(upserts[0].row).toMatchObject({ summary: null })
  })

  it("handles a customer with no reservations gracefully (new customer, no history yet)", async () => {
    const { client } = makeFakeSupabase({ reservations: { data: [], error: null } })
    const result = await recomputeCustomerIntelligence(client as never, makeSession(), "cus_1", "payment_recorded", now)

    expect(result).not.toBeNull()
    expect(result?.trust.factors.find((f) => f.key === "rental_history")?.score).toBe(0)
    expect(result?.clv.preferredCategory).toBeNull()
    expect(result?.clv.averageReservationMad).toBe(0)
  })

  it("throws when the upsert fails", async () => {
    const { client } = makeFakeSupabase({}, { error: { message: "constraint violation" } })
    await expect(recomputeCustomerIntelligence(client as never, makeSession(), "cus_1", "damage_recorded", now)).rejects.toBeTruthy()
  })
})

describe("recomputeCustomerIntelligenceBestEffort", () => {
  it("swallows an error instead of throwing", async () => {
    const { client } = makeFakeSupabase({}, { error: { message: "constraint violation" } })
    await expect(
      recomputeCustomerIntelligenceBestEffort(client as never, makeSession(), "cus_1", "damage_recorded")
    ).resolves.toBeUndefined()
  })
})

describe("getCustomerIntelligence", () => {
  it("returns the cached row, mapped, without recomputing", async () => {
    const cachedRow = {
      trust_score: 80,
      trust_band: "good",
      trust_factors: [{ key: "rental_history", label: "Successful rentals", score: 100, weight: 20 }],
      lifetime_revenue_mad: 5000,
      rental_frequency_per_year: 3,
      average_reservation_mad: 1000,
      expected_future_value_mad: 3000,
      preferred_category: "economy",
      summary: "Cached summary.",
      computed_reason: "payment_recorded",
      computed_at: "2026-07-27T00:00:00.000Z",
    }
    const { client } = makeFakeSupabase({ customer_intelligence: { data: cachedRow, error: null } })

    const result = await getCustomerIntelligence(client as never, makeSession(), "cus_1")

    expect(result).toEqual({
      trust: { score: 80, band: "good", factors: cachedRow.trust_factors },
      clv: {
        lifetimeRevenueMad: 5000,
        rentalFrequencyPerYear: 3,
        averageReservationMad: 1000,
        expectedFutureValueMad: 3000,
        preferredCategory: "economy",
      },
      summary: "Cached summary.",
      computedReason: "payment_recorded",
      computedAt: "2026-07-27T00:00:00.000Z",
    })
    expect(summaryMock.generateCustomerSummary).not.toHaveBeenCalled()
  })

  it("lazily computes and caches when nothing has been computed yet", async () => {
    const { client, upserts } = makeFakeSupabase({ customer_intelligence: { data: null, error: null } })

    const result = await getCustomerIntelligence(client as never, makeSession(), "cus_1")

    expect(result).not.toBeNull()
    expect(result?.computedReason).toBe("initial_view")
    expect(upserts).toHaveLength(1)
  })
})
