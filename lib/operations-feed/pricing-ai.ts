import { z } from "zod"

import { askAI, type AskAiResult, type SystemCaller } from "@/lib/ai/service"
import { createClient } from "@/lib/supabase/server"
import { formatMad } from "@/lib/format"
import type { PricingOutlier } from "@/lib/operations-feed/observers"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Roadmap phase 12 requirement 8's one genuinely AI-worthy observer
 * step: `findPricingOutliers` (pure z-score math) already found every
 * candidate deterministically — what it can't know is whether a given
 * discount is a legitimate business decision (a loyal repeat
 * customer, a long rental, a negotiated corporate rate) or more
 * likely a mistake worth a human glance. That's a judgment call, and
 * exactly the kind of reasoning `askAI` exists for.
 *
 * One call reviews every outlier for the company in a single request
 * — never one call per candidate, per the requirement's own cost-
 * discipline instruction. Runs as a `SystemCaller` (see
 * `lib/ai/service.ts`): the operations-feed job has no signed-in user.
 */

const reviewSchema = z.object({
  reviews: z
    .array(
      z.object({
        reservationId: z.string(),
        worthFlagging: z.boolean().describe("True only if this looks like it needs a human's attention, not just an unusual-but-explainable number."),
        reasoning: z.string().describe("One sentence a staff member would find useful — cite the specific reason (or lack of one)."),
        confidence: z.enum(["high", "medium", "low"]),
      })
    )
    .describe("One entry per candidate, in the same order given."),
})

export type PricingReview = z.infer<typeof reviewSchema>["reviews"][number]

export interface PricingReviewContext {
  reservationId: string
  customerLabel: string
  /** e.g. "repeat customer, 6 prior rentals" or "first-time customer" —
   * whatever's cheaply available; never fabricated when unknown. */
  customerNote: string
}

function buildPrompt(outliers: PricingOutlier[], context: Map<string, PricingReviewContext>): string {
  const lines = outliers.map((o, i) => {
    const ctx = context.get(o.point.reservationId)
    const direction = o.point.dailyRateMad < o.categoryMeanMad ? "below" : "above"
    return [
      `${i + 1}. Reservation ${o.point.reference} (id: ${o.point.reservationId})`,
      `   Category: ${o.point.category}, rate: ${formatMad(o.point.dailyRateMad)}/day, category average: ${formatMad(o.categoryMeanMad)}/day (${o.deviationPercent}% ${direction})`,
      `   Customer: ${ctx?.customerLabel ?? "unknown"} — ${ctx?.customerNote ?? "no history available"}`,
    ].join("\n")
  })

  return [
    "You are reviewing car rental reservations whose daily rate deviates significantly from their category's recent average. For each one, decide whether it's worth flagging for a manager to double-check, or whether the deviation looks explainable (a loyal repeat customer, a clear reason on file) and doesn't need attention.",
    "Be conservative — only flag ones that genuinely look questionable. A price deviation alone is not enough reason if there's a plausible explanation.",
    "Plain business language, never chat-bot voice.",
    "",
    ...lines,
  ].join("\n")
}

export async function reviewPricingOutliers(
  supabase: SupabaseServerClient,
  companyId: string,
  outliers: PricingOutlier[],
  context: Map<string, PricingReviewContext>
): Promise<AskAiResult<{ reviews: PricingReview[] }>> {
  const caller: SystemCaller = { userId: null, role: "system", company: { id: companyId } }
  return askAI(supabase, caller, {
    purpose: "operations_feed.review_pricing_outliers",
    prompt: buildPrompt(outliers, context),
    schema: reviewSchema,
    allowedRoles: [],
  })
}
