import { describe, expect, it, vi, beforeEach } from "vitest"

const activityLogMock = vi.hoisted(() => ({ recordEvent: vi.fn(async () => {}) }))
vi.mock("@/lib/activity-log", () => activityLogMock)

import {
  resolveDocumentEntityColumn,
  findSupersededDocument,
  getDocumentVersionHistory,
  addDaysIsoDate,
  getExpiringDocuments,
  recordDetectedExpiry,
  searchDocumentIdsByExtractedFields,
} from "@/lib/documents"

beforeEach(() => {
  activityLogMock.recordEvent.mockClear()
})

describe("resolveDocumentEntityColumn", () => {
  it("prefers customer, then vehicle, then reservation", () => {
    expect(resolveDocumentEntityColumn({ customerId: "c1", vehicleId: "v1", reservationId: "r1" })).toEqual({
      column: "customer_id",
      id: "c1",
    })
    expect(resolveDocumentEntityColumn({ vehicleId: "v1", reservationId: "r1" })).toEqual({
      column: "vehicle_id",
      id: "v1",
    })
    expect(resolveDocumentEntityColumn({ reservationId: "r1" })).toEqual({ column: "reservation_id", id: "r1" })
  })

  it("returns null when nothing is linked", () => {
    expect(resolveDocumentEntityColumn({})).toBeNull()
    expect(resolveDocumentEntityColumn({ customerId: null, vehicleId: null, reservationId: null })).toBeNull()
  })
})

describe("addDaysIsoDate", () => {
  it("adds N days as a date-only ISO string", () => {
    expect(addDaysIsoDate(5, new Date("2026-07-20T15:30:00.000Z"))).toBe("2026-07-25")
  })

  it("handles a 0-day window as 'today'", () => {
    expect(addDaysIsoDate(0, new Date("2026-07-20T15:30:00.000Z"))).toBe("2026-07-20")
  })

  it("rolls over a month/year boundary correctly", () => {
    expect(addDaysIsoDate(15, new Date("2026-12-25T00:00:00.000Z"))).toBe("2027-01-09")
  })
})

function chainable(result: { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = []
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        const promise = Promise.resolve(result)
        return promise.then.bind(promise)
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
        return proxy
      }
    },
  }
  const proxy = new Proxy({}, handler)
  return { proxy, calls }
}

describe("findSupersededDocument", () => {
  it("returns null without querying when no entity is linked", async () => {
    const client = { from: vi.fn() }
    const result = await findSupersededDocument(client as never, "co_1", { category: "driving_licence" })
    expect(result).toBeNull()
    expect(client.from).not.toHaveBeenCalled()
  })

  it("returns the existing active document's id when found", async () => {
    const { proxy, calls } = chainable({ data: { id: "doc-old" }, error: null })
    const client = { from: vi.fn(() => proxy) }

    const result = await findSupersededDocument(client as never, "co_1", {
      category: "driving_licence",
      customerId: "cus_1",
    })

    expect(result).toBe("doc-old")
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "customer_id" && c.args[1] === "cus_1")).toBe(true)
  })

  it("returns null when nothing matches", async () => {
    const { proxy } = chainable({ data: null, error: null })
    const client = { from: vi.fn(() => proxy) }

    const result = await findSupersededDocument(client as never, "co_1", {
      category: "driving_licence",
      customerId: "cus_1",
    })
    expect(result).toBeNull()
  })
})

describe("getDocumentVersionHistory", () => {
  it("returns [] without querying when no entity is linked", async () => {
    const client = { from: vi.fn() }
    const result = await getDocumentVersionHistory(client as never, "co_1", { category: "driving_licence" })
    expect(result).toEqual([])
    expect(client.from).not.toHaveBeenCalled()
  })

  it("maps rows including the version chain pointer", async () => {
    const rows = [
      { id: "doc-2", original_filename: "licence-v2.jpg", status: "active", created_at: "2026-07-20T00:00:00Z", replaces_document_id: "doc-1" },
      { id: "doc-1", original_filename: "licence-v1.jpg", status: "replaced", created_at: "2026-01-01T00:00:00Z", replaces_document_id: null },
    ]
    const { proxy } = chainable({ data: rows, error: null })
    const client = { from: vi.fn(() => proxy) }

    const result = await getDocumentVersionHistory(client as never, "co_1", {
      category: "driving_licence",
      customerId: "cus_1",
    })

    expect(result).toEqual([
      { id: "doc-2", originalFilename: "licence-v2.jpg", status: "active", createdAt: "2026-07-20T00:00:00Z", replacesDocumentId: "doc-1" },
      { id: "doc-1", originalFilename: "licence-v1.jpg", status: "replaced", createdAt: "2026-01-01T00:00:00Z", replacesDocumentId: null },
    ])
  })
})

describe("getExpiringDocuments", () => {
  it("queries with the correct threshold date and maps rows", async () => {
    const rows = [
      {
        id: "doc-1",
        category: "insurance_document",
        original_filename: "insurance.jpg",
        expires_on: "2026-07-25",
        customer_id: null,
        vehicle_id: "veh-1",
        reservation_id: null,
      },
    ]
    const { proxy, calls } = chainable({ data: rows, error: null })
    const client = { from: vi.fn(() => proxy) }

    const result = await getExpiringDocuments(client as never, "co_1", 5, new Date("2026-07-20T00:00:00Z"))

    expect(result).toEqual([
      {
        id: "doc-1",
        category: "insurance_document",
        originalFilename: "insurance.jpg",
        expiresOn: "2026-07-25",
        customerId: null,
        vehicleId: "veh-1",
        reservationId: null,
      },
    ])
    expect(calls.some((c) => c.method === "lte" && c.args[0] === "expires_on" && c.args[1] === "2026-07-25")).toBe(true)
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "active")).toBe(true)
  })

  it("throws when the query errors", async () => {
    const { proxy } = chainable({ data: null, error: { message: "boom" } })
    const client = { from: vi.fn(() => proxy) }
    await expect(getExpiringDocuments(client as never, "co_1", 5)).rejects.toBeTruthy()
  })
})

describe("recordDetectedExpiry", () => {
  it("updates expires_on and emits a document_uploaded event", async () => {
    const updateCalls: Record<string, unknown>[] = []
    const client = {
      from(table: string) {
        if (table === "documents") {
          return {
            update(row: Record<string, unknown>) {
              updateCalls.push(row)
              return { eq: () => ({ eq: async () => ({ error: null }) }) }
            },
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }

    const result = await recordDetectedExpiry(client as never, "co_1", "doc-1", "2026-08-01", "licence.jpg")

    expect(result).toEqual({ ok: true })
    expect(updateCalls).toEqual([{ expires_on: "2026-08-01" }])
    expect(activityLogMock.recordEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        companyId: "co_1",
        entityType: "document",
        entityId: "doc-1",
        type: "document_uploaded",
        actorType: "ai",
        metadata: { expires_on: "2026-08-01", detected: true },
      })
    )
  })

  it("returns ok: false and skips the event when the update fails", async () => {
    const client = {
      from() {
        return {
          update: () => ({ eq: () => ({ eq: async () => ({ error: { message: "boom" } }) }) }),
        }
      },
    }

    const result = await recordDetectedExpiry(client as never, "co_1", "doc-1", "2026-08-01", "licence.jpg")

    expect(result).toEqual({ ok: false })
    expect(activityLogMock.recordEvent).not.toHaveBeenCalled()
  })
})

describe("searchDocumentIdsByExtractedFields", () => {
  it("returns [] for an empty query without querying", async () => {
    const client = { from: vi.fn() }
    const result = await searchDocumentIdsByExtractedFields(client as never, "co_1", "   ")
    expect(result).toEqual([])
    expect(client.from).not.toHaveBeenCalled()
  })

  it("returns the deduplicated ids of extractions whose fields match", async () => {
    const rows = [
      { document_id: "doc-1", fields: { licenceNumber: { value: "B-12345", confidence: 90 } } },
      { document_id: "doc-2", fields: { fullName: { value: "Ahmed Tazi", confidence: 95 } } },
      { document_id: "doc-3", fields: { plate: { value: "12345-A-6", confidence: 80 } } },
    ]
    const { proxy } = chainable({ data: rows, error: null })
    const client = { from: vi.fn(() => proxy) }

    const result = await searchDocumentIdsByExtractedFields(client as never, "co_1", "12345")

    expect(result.sort()).toEqual(["doc-1", "doc-3"])
  })
})
