import { describe, expect, it } from "vitest"

import {
  buildConfirmationMessage,
  buildContractMessage,
  buildPaymentReminderMessage,
  buildPickupReminderMessage,
  buildReturnReminderMessage,
} from "@/lib/whatsapp-messages"

const TZ = "Africa/Casablanca"

describe("buildConfirmationMessage", () => {
  it("includes customer name, reference, vehicle, and pickup details", () => {
    const message = buildConfirmationMessage({
      customerName: "Ahmed Tazi",
      reference: "RB-1001",
      vehicleLabel: "Dacia Duster",
      pickupAtIso: "2026-08-01T09:00:00.000Z",
      pickupLocation: "Agency — Guéliz",
      timezone: TZ,
    })
    expect(message).toContain("Ahmed Tazi")
    expect(message).toContain("RB-1001")
    expect(message).toContain("Dacia Duster")
    expect(message).toContain("Agency — Guéliz")
  })

  it("omits the vehicle/location clauses when absent, without leaving dangling words", () => {
    const message = buildConfirmationMessage({
      customerName: "Sara Bennis",
      reference: "RB-1002",
      vehicleLabel: null,
      pickupAtIso: "2026-08-01T09:00:00.000Z",
      pickupLocation: null,
      timezone: TZ,
    })
    expect(message).not.toContain("for your")
    expect(message).not.toContain(" at .")
  })
})

describe("buildPickupReminderMessage", () => {
  it("mentions the reservation reference and pickup time", () => {
    const message = buildPickupReminderMessage({
      customerName: "Ahmed Tazi",
      reference: "RB-1001",
      pickupAtIso: "2026-08-01T09:00:00.000Z",
      pickupLocation: "Agency — Guéliz",
      timezone: TZ,
    })
    expect(message).toContain("RB-1001")
    expect(message).toContain("pickup")
  })
})

describe("buildReturnReminderMessage", () => {
  it("mentions the reservation reference and return time", () => {
    const message = buildReturnReminderMessage({
      customerName: "Ahmed Tazi",
      reference: "RB-1001",
      returnAtIso: "2026-08-03T09:00:00.000Z",
      returnLocation: "Marrakech Menara Airport",
      timezone: TZ,
    })
    expect(message).toContain("RB-1001")
    expect(message).toContain("return")
  })
})

describe("buildPaymentReminderMessage", () => {
  it("formats the remaining balance in MAD", () => {
    const message = buildPaymentReminderMessage({
      customerName: "Ahmed Tazi",
      reference: "RB-1001",
      remainingMad: 1200,
    })
    expect(message).toContain("1.200 MAD")
    expect(message).toContain("RB-1001")
  })
})

describe("buildContractMessage", () => {
  it("includes the pdf link when present", () => {
    const message = buildContractMessage({
      customerName: "Ahmed Tazi",
      reference: "RB-1001",
      pdfUrl: "https://example.supabase.co/storage/contract.pdf",
    })
    expect(message).toContain("https://example.supabase.co/storage/contract.pdf")
  })

  it("omits the link line when the pdf isn't available yet", () => {
    const message = buildContractMessage({
      customerName: "Ahmed Tazi",
      reference: "RB-1001",
      pdfUrl: null,
    })
    expect(message).not.toContain("http")
    expect(message).not.toContain("undefined")
  })
})
