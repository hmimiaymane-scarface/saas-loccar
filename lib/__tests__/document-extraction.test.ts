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

import { extractDocument, schemaForCategory } from "@/lib/document-extraction"

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

  return { client, inserted }
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
