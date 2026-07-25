import { describe, expect, it, vi } from "vitest"

/**
 * Roadmap phase 17's explicit acceptance criterion: a Cleaner-role
 * session's AI reservation lookup must omit payment data, not just
 * hide it in the chat UI. `@/lib/data` is mocked so this test exercises
 * only lib/ai/tools.ts's own gating logic (resolveToolPermissions +
 * the conditional spread in find_reservation/get_customer_history),
 * not the real DB query — same isolation principle as
 * lib/ai/__tests__/service.test.ts's stubbed Supabase client.
 */
const dataMock = vi.hoisted(() => ({
  getReservationsList: vi.fn(),
  getCustomerDetail: vi.fn(),
  searchCustomers: vi.fn(),
  findCustomerByPhone: vi.fn(),
  getAvailableVehicles: vi.fn(),
  getOverviewMetrics: vi.fn(),
  getTodayTimeline: vi.fn(),
  getLiveAlerts: vi.fn(),
}))
vi.mock("@/lib/data", () => dataMock)

function makeFakeSupabase(permissionsGranted: Set<string>) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "has_permission") {
        return Promise.resolve({ data: permissionsGranted.has(args.key as string), error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
    from() {
      return {
        insert() {
          return {
            select() {
              return { single: () => Promise.resolve({ data: { id: "proposal-1" }, error: null }) }
            },
          }
        },
      }
    },
  }
}

const supabaseMock = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => supabaseMock)

import { buildTools } from "@/lib/ai/tools"
import type { SessionContext } from "@/lib/auth/session"

function makeSession(role: SessionContext["role"]): SessionContext {
  return {
    userId: "user-1",
    email: "cleaner@atlas.test",
    profile: { fullName: "Test User", avatarPath: null, phone: null, preferredLanguage: "en" },
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

const SAMPLE_RESERVATION = {
  id: "res_1",
  reference: "RES-001",
  customer: { id: "cust_1", fullName: "Jane Doe", phone: "0600000000" },
  vehicle: { id: "veh_1", make: "Dacia", model: "Duster", plate: "1234-A-1", category: "suv" },
  requestedCategory: null,
  startDate: "2026-08-01",
  endDate: "2026-08-05",
  pickupLocation: "Main branch",
  returnLocation: "Main branch",
  status: "confirmed",
  isOverdue: false,
  payment: { status: "partial", totalDueMad: 2000, amountPaidMad: 500, remainingMad: 1500 },
  createdAt: "2026-07-20T00:00:00Z",
}

describe("buildTools — permission gating", () => {
  it("a Cleaner session's find_reservation omits payment fields entirely", async () => {
    dataMock.getReservationsList.mockResolvedValue({ items: [SAMPLE_RESERVATION], total: 1, page: 1, pageSize: 5 })
    supabaseMock.createClient.mockResolvedValue(makeFakeSupabase(new Set()))

    const tools = await buildTools(makeSession("cleaner"), "conv_1")
    const result = (await tools.find_reservation.execute({ query: "RES-001" }, {} as never)) as Array<Record<string, unknown>>

    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty("totalMad")
    expect(result[0]).not.toHaveProperty("remainingMad")
    expect(result[0]).toMatchObject({ reference: "RES-001", customerName: "Jane Doe" })
  })

  it("a Manager session's find_reservation includes payment fields", async () => {
    dataMock.getReservationsList.mockResolvedValue({ items: [SAMPLE_RESERVATION], total: 1, page: 1, pageSize: 5 })
    supabaseMock.createClient.mockResolvedValue(makeFakeSupabase(new Set(["view_financial_reports"])))

    const tools = await buildTools(makeSession("manager"), "conv_1")
    const result = (await tools.find_reservation.execute({ query: "RES-001" }, {} as never)) as Array<Record<string, unknown>>

    expect(result[0]).toMatchObject({ totalMad: 2000, remainingMad: 1500 })
  })

  it("a Cleaner session's get_customer_history omits outstandingBalanceMad", async () => {
    dataMock.getCustomerDetail.mockResolvedValue({
      fullName: "Jane Doe",
      phone: "0600000000",
      reservations: [],
      activeRental: null,
      outstandingBalanceMad: 1500,
    })
    supabaseMock.createClient.mockResolvedValue(makeFakeSupabase(new Set()))

    const tools = await buildTools(makeSession("cleaner"), "conv_1")
    const result = (await tools.get_customer_history.execute({ customerId: "cust_1" }, {} as never)) as Record<string, unknown>

    expect(result).not.toHaveProperty("outstandingBalanceMad")
  })

  it("a Cleaner session cannot propose recording a payment", async () => {
    supabaseMock.createClient.mockResolvedValue(makeFakeSupabase(new Set()))

    const tools = await buildTools(makeSession("cleaner"), "conv_1")
    const result = (await tools.propose_record_payment.execute(
      {
        reservationId: "res_1",
        reservationReference: "RES-001",
        customerId: "cust_1",
        amountMad: 500,
        method: "cash",
        transactionType: "rental_payment",
      },
      {} as never
    )) as { error?: string }

    expect(result.error).toMatch(/permission/i)
  })

  it("an Accountant session with record_payments can propose recording a payment", async () => {
    supabaseMock.createClient.mockResolvedValue(makeFakeSupabase(new Set(["record_payments"])))

    const tools = await buildTools(makeSession("accountant"), "conv_1")
    const result = (await tools.propose_record_payment.execute(
      {
        reservationId: "res_1",
        reservationReference: "RES-001",
        customerId: "cust_1",
        amountMad: 500,
        method: "cash",
        transactionType: "rental_payment",
      },
      {} as never
    )) as { proposalId?: string; error?: string }

    expect(result.error).toBeUndefined()
    expect(result.proposalId).toBe("proposal-1")
  })
})
