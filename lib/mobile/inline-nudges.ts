import { missingRequiredPhotoSlots } from "@/lib/inspections/rules"
import { PHOTO_SLOTS } from "@/lib/inspections/photo-slots"

/**
 * Roadmap phase 16 requirement 7 — "the assistant should proactively
 * assist during a task... rather than waiting to be asked." Most of
 * the bible's own named examples ("you forgot to capture the rear of
 * the vehicle," "this vehicle already has reported damage") are pure
 * checks against data the wizard already has loaded for other reasons
 * — not generative AI, and not a new fetch. Reusing
 * missingRequiredPhotoSlots (phase 15) directly rather than
 * duplicating that logic is the point: one source of truth for "what's
 * still missing," surfaced two ways (a hard block at completion, and
 * this softer inline nudge earlier in the flow).
 *
 * Deliberately scoped down from the bible's full example list: a
 * "licence expires next month" nudge would need the customer's licence
 * expiry loaded into the pickup/return wizard's own data, which it
 * currently isn't (a separate fetch, out of this checkpoint's "reuse
 * what's already loaded" scope) — see docs/mobile.md.
 */

export interface InlineNudge {
  id: string
  message: string
  tone: "warning" | "info"
}

export interface NudgeInput {
  capturedPhotoSlots: string[]
  /** True once every required slot is captured — nudges about missing
   * photos stop once this flips, same threshold completion enforces. */
  vehicleDamageCount: number
}

export function buildInlineNudges(input: NudgeInput): InlineNudge[] {
  const nudges: InlineNudge[] = []

  const missing = missingRequiredPhotoSlots(input.capturedPhotoSlots)
  if (missing.length > 0) {
    const labels = missing.map((key) => PHOTO_SLOTS.find((s) => s.key === key)?.label ?? key)
    nudges.push({
      id: "missing-photos",
      message: `Don't forget: ${labels.join(", ").toLowerCase()} still need${labels.length === 1 ? "s" : ""} a photo.`,
      tone: "warning",
    })
  }

  if (input.vehicleDamageCount > 0) {
    nudges.push({
      id: "prior-damage",
      message: `This vehicle already has ${input.vehicleDamageCount} damage record${input.vehicleDamageCount === 1 ? "" : "s"} on file — worth a quick look before you start.`,
      tone: "info",
    })
  }

  return nudges
}
