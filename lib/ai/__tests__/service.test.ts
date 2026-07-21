import { describe, expect, it, vi, beforeEach } from "vitest"
import { z } from "zod"
import { NoObjectGeneratedError, APICallError } from "ai"

// generateObject is the external dependency askAI() calls out to —
// mocked so these tests never make a real, paid API call. The rest of
// the `ai` module (NoObjectGeneratedError, APICallError — real,
// constructable error classes) is preserved via importOriginal so
// classifyError()'s `.isInstance()` checks work against genuine
// instances, not a hand-rolled stand-in. Same stubbed-Supabase-client
// pattern as lib/__tests__/document-extraction.test.ts.
const aiMock = vi.hoisted(() => ({ generateObject: vi.fn() }))
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return { ...actual, generateObject: aiMock.generateObject }
})

const modelsMock = vi.hoisted(() => ({
  resolveAvailableProvider: vi.fn(),
  resolveModel: vi.fn(),
}))
vi.mock("@/lib/ai/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/models")>()
  return { ...actual, ...modelsMock }
})

import { askAI } from "@/lib/ai/service"
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

function makeFakeSupabase() {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ table, row })
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  }
  return { client, inserted }
}

const testSchema = z.object({ summary: z.string() })

/** NoObjectGeneratedError's constructor requires response/usage/
 * finishReason — irrelevant to what these tests check (only
 * `.isInstance()` classification matters), so this stubs them out. */
function makeNoObjectGeneratedError(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    response: {} as never,
    usage: {} as never,
    finishReason: "stop",
  })
}

beforeEach(() => {
  aiMock.generateObject.mockReset()
  modelsMock.resolveAvailableProvider.mockReset()
  modelsMock.resolveModel.mockReset()
  modelsMock.resolveAvailableProvider.mockReturnValue("anthropic")
  modelsMock.resolveModel.mockReturnValue({ modelId: "claude-sonnet-5" })
})

describe("askAI", () => {
  it("returns permission_denied without calling the model when the role isn't allowed", async () => {
    const { client, inserted } = makeFakeSupabase()
    const session = makeSession("driver")

    const result = await askAI(client as never, session, {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({ ok: false, error: "permission_denied", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
  })

  it("returns provider_not_configured without calling the model", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue(null)
    const { client } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({ ok: false, error: "provider_not_configured", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
  })

  it("returns typed data with high confidence on a clean first-try success", async () => {
    aiMock.generateObject.mockResolvedValue({ object: { summary: "Reliable vehicle, low downtime." } })
    const { client, inserted } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({
      ok: true,
      data: { summary: "Reliable vehicle, low downtime." },
      confidence: "high",
      modelId: "claude-sonnet-5",
    })
    expect(aiMock.generateObject).toHaveBeenCalledTimes(1)
    expect(inserted).toEqual([
      {
        table: "ai_usage_log",
        row: expect.objectContaining({ company_id: "co_1", purpose: "vehicle.summarize", success: true }),
      },
    ])
  })

  it("retries once on a malformed response and succeeds with medium confidence", async () => {
    aiMock.generateObject
      .mockRejectedValueOnce(makeNoObjectGeneratedError())
      .mockResolvedValueOnce({ object: { summary: "Recovered on retry." } })
    const { client, inserted } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "customer.trust_score",
      prompt: "Summarize this customer.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({
      ok: true,
      data: { summary: "Recovered on retry." },
      confidence: "medium",
      modelId: "claude-sonnet-5",
    })
    expect(aiMock.generateObject).toHaveBeenCalledTimes(2)
    expect(inserted).toHaveLength(1)
    expect(inserted[0].row).toMatchObject({ success: true })
  })

  it("returns invalid_response after two malformed responses", async () => {
    aiMock.generateObject
      .mockRejectedValueOnce(makeNoObjectGeneratedError())
      .mockRejectedValueOnce(makeNoObjectGeneratedError())
    const { client, inserted } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({ ok: false, error: "invalid_response", message: expect.any(String) })
    expect(aiMock.generateObject).toHaveBeenCalledTimes(2)
    expect(inserted[0].row).toMatchObject({ success: false, error_code: "invalid_response" })
  })

  it("does not retry a rate-limit error and classifies it correctly", async () => {
    aiMock.generateObject.mockRejectedValue(
      new APICallError({ message: "Too Many Requests", url: "https://api.example.com", requestBodyValues: {}, statusCode: 429 })
    )
    const { client, inserted } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({ ok: false, error: "rate_limited", message: expect.any(String) })
    expect(aiMock.generateObject).toHaveBeenCalledTimes(1)
    expect(inserted[0].row).toMatchObject({ success: false, error_code: "rate_limited" })
  })

  it("does not retry a generic provider error and classifies it as provider_error", async () => {
    aiMock.generateObject.mockRejectedValue(
      new APICallError({ message: "Internal Server Error", url: "https://api.example.com", requestBodyValues: {}, statusCode: 500 })
    )
    const { client } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({ ok: false, error: "provider_error", message: expect.any(String) })
    expect(aiMock.generateObject).toHaveBeenCalledTimes(1)
  })

  it("classifies an abort/timeout error as timeout", async () => {
    const timeoutErr = new Error("The operation timed out")
    timeoutErr.name = "AbortError"
    aiMock.generateObject.mockRejectedValue(timeoutErr)
    const { client } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({ ok: false, error: "timeout", message: expect.any(String) })
  })

  it("classifies an unrecognized error as provider_error", async () => {
    aiMock.generateObject.mockRejectedValue(new Error("something weird happened"))
    const { client } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({ ok: false, error: "provider_error", message: expect.any(String) })
  })

  it("does not let an ordinary logging failure mask a successful result", async () => {
    // Matches how the real Supabase client behaves: an RLS denial or
    // constraint violation on the insert resolves with an `error` field
    // rather than rejecting — recordEvent already relies on this same
    // behavior without guarding against it (see lib/__tests__/activity-log.test.ts).
    aiMock.generateObject.mockResolvedValue({ object: { summary: "All good." } })
    const client = {
      from() {
        return { insert: () => Promise.resolve({ data: null, error: { message: "log table unavailable" } }) }
      },
    }

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle.",
      schema: testSchema,
      allowedRoles: ["owner", "manager"],
    })

    expect(result).toEqual({ ok: true, data: { summary: "All good." }, confidence: "high", modelId: "claude-sonnet-5" })
  })
})

// --- Acceptance criterion: two different "module-style" callers, two
// different domain schemas, same service — proving askAI() is genuinely
// reusable across domains rather than shaped around one caller. Neither
// vehicle-health-scoring (phase 06) nor customer-trust-scoring (phase
// 08) exist yet; these stand in for what those phases' calls will look
// like once they do. ---

const vehicleSummarySchema = z.object({
  healthSummary: z.string(),
  riskFactors: z.array(z.string()),
})

const customerSummarySchema = z.object({
  trustSummary: z.string(),
  flaggedConcerns: z.array(z.string()),
})

describe("askAI as a platform service — cross-domain reuse", () => {
  it("a vehicle-module-style call works through the service", async () => {
    aiMock.generateObject.mockResolvedValue({
      object: { healthSummary: "Low mileage, no open damages, insurance current.", riskFactors: [] },
    })
    const { client, inserted } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "vehicle.summarize",
      prompt: "Summarize this vehicle's health and flag any risk factors: Dacia Duster, 22,000 km, no open damages.",
      schema: vehicleSummarySchema,
      allowedRoles: ["owner", "manager", "agent"],
    })

    expect(result).toEqual({
      ok: true,
      data: { healthSummary: "Low mileage, no open damages, insurance current.", riskFactors: [] },
      confidence: "high",
      modelId: "claude-sonnet-5",
    })
    expect(inserted[0].row).toMatchObject({ purpose: "vehicle.summarize" })
  })

  it("a customer-module-style call works through the same service with a different schema", async () => {
    aiMock.generateObject.mockResolvedValue({
      object: { trustSummary: "Long-standing customer, always pays on time.", flaggedConcerns: [] },
    })
    const { client, inserted } = makeFakeSupabase()

    const result = await askAI(client as never, makeSession(), {
      purpose: "customer.summarize",
      prompt: "Summarize this customer's history and flag any concerns: 6 completed bookings, no outstanding balance.",
      schema: customerSummarySchema,
      allowedRoles: ["owner", "manager", "agent"],
    })

    expect(result).toEqual({
      ok: true,
      data: { trustSummary: "Long-standing customer, always pays on time.", flaggedConcerns: [] },
      confidence: "high",
      modelId: "claude-sonnet-5",
    })
    expect(inserted[0].row).toMatchObject({ purpose: "customer.summarize" })
  })
})
