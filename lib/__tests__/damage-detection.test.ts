import { describe, expect, it, vi, beforeEach } from "vitest"

// Same mocking convention as lib/__tests__/document-extraction.test.ts —
// generateObject and the model resolvers are external dependencies,
// mocked so these tests never make a real, paid API call.
const aiMock = vi.hoisted(() => ({ generateObject: vi.fn() }))
vi.mock("ai", () => ({ generateObject: aiMock.generateObject }))

const modelsMock = vi.hoisted(() => ({
  resolveAvailableProvider: vi.fn(),
  resolveModel: vi.fn(),
}))
vi.mock("@/lib/ai/models", () => modelsMock)

import { compareInspectionPhotos } from "@/lib/damage-detection"

const BEFORE_BYTES = Buffer.from("before-photo-bytes")
const AFTER_BYTES = Buffer.from("after-photo-bytes")

beforeEach(() => {
  aiMock.generateObject.mockReset()
  modelsMock.resolveAvailableProvider.mockReset()
  modelsMock.resolveModel.mockReset()
  modelsMock.resolveAvailableProvider.mockReturnValue("anthropic")
  modelsMock.resolveModel.mockReturnValue({ modelId: "claude-sonnet-5" })
})

describe("compareInspectionPhotos", () => {
  it("flags an obvious visible difference with reasonable confidence (acceptance criterion 1)", async () => {
    aiMock.generateObject.mockResolvedValue({
      object: { damageDetected: true, confidence: 88, description: "Fresh dent on the rear-left door" },
    })

    const result = await compareInspectionPhotos(BEFORE_BYTES, "image/jpeg", AFTER_BYTES, "image/jpeg")

    expect(result).toEqual({
      ok: true,
      damageDetected: true,
      confidence: 88,
      description: "Fresh dent on the rear-left door",
    })
  })

  it("does NOT flag damage for two visually identical photos — false positives erode trust (acceptance criterion 2)", async () => {
    aiMock.generateObject.mockResolvedValue({
      object: { damageDetected: false, confidence: 95, description: "" },
    })

    const result = await compareInspectionPhotos(BEFORE_BYTES, "image/jpeg", AFTER_BYTES, "image/jpeg")

    expect(result).toEqual({ ok: true, damageDetected: false, confidence: 95, description: "" })
  })

  it("passes both images to the model in one call, before then after", async () => {
    aiMock.generateObject.mockResolvedValue({ object: { damageDetected: false, confidence: 90, description: "" } })

    await compareInspectionPhotos(BEFORE_BYTES, "image/jpeg", AFTER_BYTES, "image/png")

    expect(aiMock.generateObject).toHaveBeenCalledTimes(1)
    const call = aiMock.generateObject.mock.calls[0][0]
    const fileParts = call.messages[0].content.filter((c: { type: string }) => c.type === "file")
    expect(fileParts).toHaveLength(2)
    expect(fileParts[0]).toMatchObject({ data: BEFORE_BYTES, mediaType: "image/jpeg" })
    expect(fileParts[1]).toMatchObject({ data: AFTER_BYTES, mediaType: "image/png" })
  })

  it("returns unsupported_file_type without ever calling the provider when either photo isn't a supported image type", async () => {
    const result = await compareInspectionPhotos(BEFORE_BYTES, "application/pdf", AFTER_BYTES, "image/jpeg")
    expect(result).toEqual({ ok: false, error: "unsupported_file_type", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
  })

  it("returns provider_not_configured when no AI provider is available", async () => {
    modelsMock.resolveAvailableProvider.mockReturnValue(null)
    const result = await compareInspectionPhotos(BEFORE_BYTES, "image/jpeg", AFTER_BYTES, "image/jpeg")
    expect(result).toEqual({ ok: false, error: "provider_not_configured", message: expect.any(String) })
    expect(aiMock.generateObject).not.toHaveBeenCalled()
  })

  it("returns a typed error when the provider throws, rather than crashing the caller", async () => {
    aiMock.generateObject.mockRejectedValue(new Error("model timeout"))
    const result = await compareInspectionPhotos(BEFORE_BYTES, "image/jpeg", AFTER_BYTES, "image/jpeg")
    expect(result).toEqual({ ok: false, error: "provider_error", message: expect.any(String) })
  })
})
