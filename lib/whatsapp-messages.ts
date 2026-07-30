import { formatInTimeZone } from "@/lib/timezone"
import { formatMad } from "@/lib/format"

/**
 * Roadmap phase 45 — one plain-string builder per message type named
 * in the brief. Deliberately plain, editable-feeling text (not a rigid
 * templating system with named placeholders) — the brief's own
 * "start simple... do not over-automate before templates... are
 * validated" instruction reads as "don't build a template *engine*
 * yet," not "don't write any text." Every message ends up in the
 * `wa.me` prefilled-text box, which the sender can still edit by hand
 * before pressing send in WhatsApp — these are starting points, not
 * final copy locked behind a settings page.
 */

interface ConfirmationInput {
  customerName: string
  reference: string
  vehicleLabel: string | null
  pickupAtIso: string
  pickupLocation: string | null
  timezone: string
}

export function buildConfirmationMessage(input: ConfirmationInput): string {
  const pickup = formatInTimeZone(input.pickupAtIso, input.timezone, {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const vehicleLine = input.vehicleLabel ? ` for your ${input.vehicleLabel}` : ""
  const locationLine = input.pickupLocation ? ` at ${input.pickupLocation}` : ""
  return `Hi ${input.customerName}, this confirms your reservation ${input.reference}${vehicleLine}. Pickup is ${pickup}${locationLine}. See you then!`
}

interface PickupReminderInput {
  customerName: string
  reference: string
  pickupAtIso: string
  pickupLocation: string | null
  timezone: string
}

export function buildPickupReminderMessage(input: PickupReminderInput): string {
  const pickup = formatInTimeZone(input.pickupAtIso, input.timezone, {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const locationLine = input.pickupLocation ? ` at ${input.pickupLocation}` : ""
  return `Hi ${input.customerName}, just a reminder — your pickup for reservation ${input.reference} is ${pickup}${locationLine}. Let us know if anything's changed.`
}

interface ReturnReminderInput {
  customerName: string
  reference: string
  returnAtIso: string
  returnLocation: string | null
  timezone: string
}

export function buildReturnReminderMessage(input: ReturnReminderInput): string {
  const returnTime = formatInTimeZone(input.returnAtIso, input.timezone, {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const locationLine = input.returnLocation ? ` at ${input.returnLocation}` : ""
  return `Hi ${input.customerName}, just a reminder — your return for reservation ${input.reference} is due ${returnTime}${locationLine}. Let us know if you need more time.`
}

interface PaymentReminderInput {
  customerName: string
  reference: string
  remainingMad: number
}

export function buildPaymentReminderMessage(input: PaymentReminderInput): string {
  return `Hi ${input.customerName}, a quick note that reservation ${input.reference} has an outstanding balance of ${formatMad(input.remainingMad)}. Let us know when's a good time to settle it.`
}

interface ContractMessageInput {
  customerName: string
  reference: string
  pdfUrl: string | null
}

export function buildContractMessage(input: ContractMessageInput): string {
  const linkLine = input.pdfUrl ? ` Here's the link: ${input.pdfUrl}` : ""
  return `Hi ${input.customerName}, here's the rental contract for reservation ${input.reference}.${linkLine}`
}
