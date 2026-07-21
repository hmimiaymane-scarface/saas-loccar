import { describe, expect, it, vi, beforeEach } from "vitest"

// generateObject and the AI model resolvers are the external
// dependencies extractDocument calls out to — mocked so these tests
// never make a real, paid API call. Same stubbed-Supabase-client
// pattern as lib/__tests__/activity-log.test.ts.
const aiMock = vi.hoisted(() => ({ generateObject: vi.fn() }))
vi.mock("ai", () => ({ generateObject: aiMock.generateObject }))

const modelsMock = vi.hoisted(() => ({
  resolveAvailableProvider: vi.fn(),
  resolveModel: vi.fn(),
}))
vi.mock("@/lib/ai/models", () => modelsMock)

import {
  extractDocument,
  schemaForCategory,
  classifyDocument,
  classifyAndExtractDocument,
  fieldsContainText,
} from "@/lib/document-extraction"

describe("schemaForCategory", () => {
  it("returns the right schema shape for each supported category", () => {
    expect(Object.keys(schemaForCategory("identity_document")?.shape ?? {})).toEqual([
      "fullName",
      "idNumber",
      "birthDate",
      "expiryDate",
      "nationality",
    ])
    expect(Object.keys(schemaForCategory("driving_licence")?.shape ?? {})).toEqual([
      "fullName",
      "licenceNumber",
      "categories",
      "expiryDate",
      "country",
    ])
    expect(Object.keys(schemaForCategory("vehicle_registration")?.shape ?? {})).toEqual([
      "plate",
      "vin",
      "make",
      "model",
      "owner",
    ])
    expect(Object.keys(schemaForCategory("insurance_document")?.shape ?? {})).toEqual([
      "policyNumber",
      "insurer",
      "expiryDate",
      "coverageType",
    ])
  })

  it("returns null for categories with no extraction schema", () => {
    expect(schemaForCategory("rental_contract")).toBeNull()
    expect(schemaForCategory("proof_of_address")).toBeNull()
    expect(schemaForCategory("technical_inspection")).toBeNull()
    expect(schemaForCategory("payment_receipt")).toBeNull()
    expect(schemaForCategory("other")).toBeNull()
  })
})

function makeFakeSupabase(documentRow: Record<string, unknown>, insertShouldFail = false) {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  const updates: { table: string; row: Record<string, unknown> }[] = []

  const client = {
    from(table: string) {
      if (table === "documents") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: documentRow, error: null }),
              }),
            }),
          }),
          update(row: Record<string, unknown>) {
            updates.push({ table, row })
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }
          },
        }
      }
      // document_extractions
      return {
        insert(row: Record<string, unknown>) {
          inserted.push({ table, row })
          const resolved = insertShouldFail
            ? { data: null, error: { message: "insert failed" } }
            : { data: { id: "extraction-1" }, error: null }
          const promise = Promise.resolve(resolved)
          return Object.assign(promise, { select: () => ({ single: async () => resolved }) })
        },
      }
    },
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }),
      }),
    },
  }

  return { client, inserted, updates }
}

const IDENTITY_DOCUMENT_ROW = {
  id: "doc-1",
  category: "identity_document",
  storage_path: "co_1/documents/cust-1/file.jpg",
  mime_type: "image/jpeg",
}

beforeEach(() => {
  aiMock.generateObject.mockReset()
  modelsMock.resolveAvailableProvider.mockReset()
  modelsMock.resolveModel.mockReset()
})

describe("extractDocument", () => {
  it("persists a completed row and returns the extracted fields on success", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue("anthropic")
    modelsMock.resolveModel.mockReturnValue({ modelId: "claude-sonnet-5" })
    aiMock.generateObject.mockResolvedValue({
      object: { fullName: { value: "Aicha Bennani", confidence: 99 } },
    })

    const { client, inserted } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)
    const result = await extractDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({
      ok: true,
      extractionId: "extraction-1",
      category: "identity_document",
      fields: { fullName: { value: "Aicha Bennani", confidence: 99 } },
    })
    expect(inserted).toHaveLength(1)
    expect(inserted[0].row).toMatchObject({ status: "completed", model: "claude-sonnet-5" })
  })

  it("persists a failed row and returns a typed error when the provider throws", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue("anthropic")
    modelsMock.resolveModel.mockReturnValue({ modelId: "claude-sonnet-5" })
    aiMock.generateObject.mockRejectedValue(new Error("model timeout"))

    const { client, inserted } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)
    const result = await extractDocument(client as never, "co_1", "doc-1")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("provider_error")
    expect(inserted[0].row).toMatchObject({ status: "failed", error_message: "model timeout" })
  })

  it("returns unsupported_category without ever calling the provider (cost control)", async () => {
    const { client } = makeFakeSupabase({ ...IDENTITY_DOCUMENT_ROW, category: "rental_contract" })
    const result = await extractDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: false, error: "unsupported_category", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
  })

  it("returns unsupported_file_type for a PDF without ever calling the provider", async () => {
    const { client } = makeFakeSupabase({ ...IDENTITY_DOCUMENT_ROW, mime_type: "application/pdf" })
    const result = await extractDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: false, error: "unsupported_file_type", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
  })

  it("returns provider_not_configured when no AI provider is available", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue(null)
    const { client } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)
    const result = await extractDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: false, error: "provider_not_configured", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
  })
})

describe("classifyDocument", () => {
  it("returns the guessed category and confidence on success", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue("anthropic")
    modelsMock.resolveModel.mockReturnValue({ modelId: "claude-sonnet-5" })
    aiMock.generateObject.mockResolvedValue({ object: { category: "driving_licence", confidence: 91 } })

    const { client } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)
    const result = await classifyDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: true, category: "driving_licence", confidence: 91 })
  })

  it("returns unsupported_file_type for a PDF without ever calling the provider", async () => {
    const { client } = makeFakeSupabase({ ...IDENTITY_DOCUMENT_ROW, mime_type: "application/pdf" })
    const result = await classifyDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: false, error: "unsupported_file_type", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
  })

  it("returns provider_not_configured when no AI provider is available", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue(null)
    const { client } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)
    const result = await classifyDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: false, error: "provider_not_configured", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
  })

  it("returns a typed error when the provider throws", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue("anthropic")
    modelsMock.resolveModel.mockReturnValue({ modelId: "claude-sonnet-5" })
    aiMock.generateObject.mockRejectedValue(new Error("model timeout"))

    const { client } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)
    const result = await classifyDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: false, error: "provider_error", message: expect.any(String) })
  })
})

describe("classifyAndExtractDocument", () => {
  it("classifies, persists the detected category, and extracts when the category has a schema", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue("anthropic")
    modelsMock.resolveModel.mockReturnValue({ modelId: "claude-sonnet-5" })
    aiMock.generateObject
      .mockResolvedValueOnce({ object: { category: "insurance_document", confidence: 88 } })
      .mockResolvedValueOnce({ object: { policyNumber: { value: "POL-1", confidence: 90 } } })

    const { client, updates, inserted } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)
    const result = await classifyAndExtractDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({
      ok: true,
      category: "insurance_document",
      classificationConfidence: 88,
      extraction: {
        ok: true,
        extractionId: "extraction-1",
        category: "insurance_document",
        fields: { policyNumber: { value: "POL-1", confidence: 90 } },
      },
    })
    expect(updates).toContainEqual({ table: "documents", row: { category: "insurance_document" } })
    expect(inserted).toHaveLength(1)
    expect(aiMock.generateObject).toHaveBeenCalledTimes(2)
  })

  it("skips extraction (extraction: null) when the classified category has no extraction schema", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue("anthropic")
    modelsMock.resolveModel.mockReturnValue({ modelId: "claude-sonnet-5" })
    aiMock.generateObject.mockResolvedValueOnce({ object: { category: "payment_receipt", confidence: 70 } })

    const { client } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)
    const result = await classifyAndExtractDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: true, category: "payment_receipt", classificationConfidence: 70, extraction: null })
    expect(aiMock.generateObject).toHaveBeenCalledTimes(1)
  })

  it("stops at the classification error without touching the document row", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue(null)
    const { client, updates } = makeFakeSupabase(IDENTITY_DOCUMENT_ROW)

    const result = await classifyAndExtractDocument(client as never, "co_1", "doc-1")

    expect(result).toEqual({ ok: false, error: "provider_not_configured", message: expect.any(String) })
    expect(updates).toHaveLength(0)
  })
})

describe("fieldsContainText", () => {
  const fields = {
    fullName: { value: "Aicha Bennani", confidence: 99 },
    licenceNumber: { value: "B-12345", confidence: 95 },
    categories: { value: ["B", "A1"], confidence: 80 },
  }

  it("matches a case-insensitive substring of a string field", () => {
    expect(fieldsContainText(fields, "bennani")).toBe(true)
    expect(fieldsContainText(fields, "AICHA")).toBe(true)
  })

  it("matches inside an array field", () => {
    expect(fieldsContainText(fields, "A1")).toBe(true)
  })

  it("returns false when nothing matches", () => {
    expect(fieldsContainText(fields, "nonexistent")).toBe(false)
  })

  it("returns false for an empty or whitespace-only query", () => {
    expect(fieldsContainText(fields, "")).toBe(false)
    expect(fieldsContainText(fields, "   ")).toBe(false)
  })
})
