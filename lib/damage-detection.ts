import { generateObject } from "ai"
import { z } from "zod"

import { resolveVisionModel, SUPPORTED_IMAGE_MIME_TYPES, type ExtractionErrorCode } from "@/lib/document-extraction"

/**
 * AI-assisted damage detection (roadmap phase 15 — "Guided Pickup/Return
 * Upgrade: AI Damage Detection"). Compares a pickup inspection photo
 * against the return inspection photo of the same angle and flags
 * likely NEW damage for an employee to confirm.
 *
 * Deliberately bypasses lib/ai/service.ts#askAI() the same way
 * lib/document-extraction.ts already does — askAI's AskAiInput only
 * accepts a plain text prompt (no file/image attachments at all), so a
 * vision call has to go around it either way. This module follows
 * document-extraction.ts's own established convention (a standalone
 * vision service, direct generateObject call) rather than reaching into
 * askAI's core to add multi-image support for a single caller — see
 * docs/damage-detection.md for the full tradeoff. Known consequence:
 * this call is not centrally logged in ai_usage_log, the same accepted
 * limitation document-extraction.ts already has.
 *
 * IMPORTANT — this is a suggestion engine, not a verdict. Every result
 * is surfaced through components/domain/intelligence/ai-recommendation-card.tsx
 * (Accept/Dismiss) and never auto-creates a damage record — see
 * app/(dashboard)/inspections/actions.ts#detectReturnDamage and
 * components/domain/returns/return-wizard.tsx. The employee always has
 * the final say, especially given a vision model comparing two ordinary
 * phone photos will sometimes be wrong in either direction.
 */

const damageComparisonSchema = z.object({
  damageDetected: z
    .boolean()
    .describe("True only if the SECOND (after/return) photo shows genuine new physical damage not visible in the FIRST (before/pickup) photo."),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe("0-100: how certain you are. Use a LOW score rather than guessing when the photos are hard to compare (different lighting, angle, zoom, distance)."),
  description: z
    .string()
    .describe(
      "If damage detected, a short, specific description (e.g. 'scratch on rear bumper, lower right corner'). Empty string if no damage detected."
    ),
})

function buildComparisonPrompt(): string {
  return [
    "You are comparing two photos of the same vehicle, from the same angle.",
    "The FIRST photo was taken at pickup (before the rental). The SECOND photo was taken at return (after the rental).",
    "Determine whether the second photo shows any NEW physical damage — a scratch, dent, crack, tear, or similar — that is not visible in the first photo.",
    "Do NOT flag damage that is already visible in the first (pickup) photo — only genuinely new damage counts.",
    "Do NOT flag differences caused by lighting, camera angle, zoom, distance, dirt, reflections, or image quality — only real physical damage to the vehicle.",
    "If you are uncertain whether something is new damage or just a photo artifact, use a lower confidence score rather than a false positive — a missed detection is far less costly than a false alarm here.",
  ].join(" ")
}

/** Reuses ExtractionErrorCode wholesale rather than a narrower type —
 * resolveVisionModel()'s own return type is stated in those terms
 * (shared with lib/document-extraction.ts), and "not_found"/
 * "unsupported_category" simply never occur on this path in practice. */
export type DamageComparisonErrorCode = ExtractionErrorCode

export type DamageComparisonResult =
  | { ok: true; damageDetected: boolean; confidence: number; description: string }
  | { ok: false; error: DamageComparisonErrorCode; message: string }

/** Runs the two-image vision comparison. Never persists anything itself
 * — the caller (detectReturnDamage) decides what to do with the result,
 * and nothing becomes a damage record until a human accepts it. */
export async function compareInspectionPhotos(
  beforeBytes: Buffer,
  beforeMimeType: string,
  afterBytes: Buffer,
  afterMimeType: string
): Promise<DamageComparisonResult> {
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(beforeMimeType) || !SUPPORTED_IMAGE_MIME_TYPES.includes(afterMimeType)) {
    return {
      ok: false,
      error: "unsupported_file_type",
      message: "Only JPEG, PNG, or WEBP photos can be compared automatically right now.",
    }
  }

  const resolved = resolveVisionModel()
  if (!resolved.ok) return resolved

  try {
    const { object } = await generateObject({
      model: resolved.model,
      schema: damageComparisonSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildComparisonPrompt() },
            { type: "text", text: "First photo (pickup / before):" },
            { type: "file", data: beforeBytes, mediaType: beforeMimeType },
            { type: "text", text: "Second photo (return / after):" },
            { type: "file", data: afterBytes, mediaType: afterMimeType },
          ],
        },
      ],
    })

    return {
      ok: true,
      damageDetected: object.damageDetected,
      confidence: object.confidence,
      description: object.description,
    }
  } catch {
    return {
      ok: false,
      error: "provider_error",
      message: "We couldn't compare these photos automatically. You can still review them yourself.",
    }
  }
}
