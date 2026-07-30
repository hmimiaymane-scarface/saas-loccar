import { describe, expect, it } from "vitest"

import { buildWhatsAppUrl, normalizePhoneForWhatsApp } from "@/lib/whatsapp"

describe("normalizePhoneForWhatsApp", () => {
  it("strips a leading + and formatting characters", () => {
    expect(normalizePhoneForWhatsApp("+212 661-234567")).toBe("212661234567")
  })

  it("strips spaces and dashes with no leading +", () => {
    expect(normalizePhoneForWhatsApp("06 61-23 45 67")).toBe("0661234567")
  })

  it("returns null for null/undefined/empty input", () => {
    expect(normalizePhoneForWhatsApp(null)).toBeNull()
    expect(normalizePhoneForWhatsApp(undefined)).toBeNull()
    expect(normalizePhoneForWhatsApp("")).toBeNull()
  })

  it("returns null for something too short to be a real phone number", () => {
    expect(normalizePhoneForWhatsApp("1234")).toBeNull()
  })
})

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me link with the message URL-encoded", () => {
    const url = buildWhatsAppUrl("+212 661-234567", "Hello there!")
    expect(url).toBe("https://wa.me/212661234567?text=Hello%20there!")
  })

  it("returns null when the phone doesn't normalize", () => {
    expect(buildWhatsAppUrl("", "Hello")).toBeNull()
    expect(buildWhatsAppUrl(null, "Hello")).toBeNull()
  })

  it("percent-encodes special characters and newlines", () => {
    const url = buildWhatsAppUrl("+212661234567", "Line one\nLine two — 100 MAD?")
    expect(url).toContain("Line%20one%0ALine%20two")
    expect(url).toContain("100%20MAD")
  })
})
