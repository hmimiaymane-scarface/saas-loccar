import { z } from "zod"

import { askAI, type AskAiResult } from "@/lib/ai/service"
import { createClient } from "@/lib/supabase/server"
import type { SessionContext } from "@/lib/auth/session"
import type { VehicleHealthResult, VehicleProfitabilityResult, VehicleUtilizationResult } from "@/lib/vehicle-intelligence"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Vehicle Insights (roadmap phase 06 requirement 4, extended by phase
 * 07 requirement 3) — the first real caller of phase 05's askAI()
 * service. Advisory only: "AI may recommend. Humans decide." (bible,
 * non-negotiable) — nothing here writes to any operational table, it
 * only produces text for the vehicle detail page's Overview (the
 * summary sentence) and AI Insights (the recommendation cards,
 * components/domain/intelligence/ai-recommendation-card.tsx) sections.
 *
 * One askAI() call generates both the summary and the recommendations
 * together — they're grounded in the exact same health/profitability/
 * utilization snapshot, and a second model round-trip for one more
 * sentence would double the cost of every recompute for no real
 * benefit (see docs/vehicle-command-center.md).
 */

export interface VehicleRecommendation {
  observation: string
  reasoning: string
  suggestedAction: string
}

export interface VehicleInsights {
  summary: string
  recommendations: VehicleRecommendation[]
}

const vehicleInsightsSchema = z.object({
  summary: z
    .string()
    .describe(
      "One or two sentences on what's happening with this vehicle right now, in plain business language — not a paragraph, no chat-bot voice."
    ),
  recommendations: z
    .array(
      z.object({
        observation: z.string().describe("A brief factual observation about this vehicle, grounded in the data given"),
        reasoning: z.string().describe("Why this matters, referencing specific numbers/facts from the data given"),
        suggestedAction: z
          .string()
          .describe("A concrete, specific action — e.g. 'Schedule an oil change within 2 weeks', not 'Consider maintenance'"),
      })
    )
    .max(4),
})

function formatFactorLine(label: string, score: number, weight: number): string {
  return `- ${label}: ${score}/100 (weight ${weight})`
}

function formatBreakdownLine(label: string, amountMad: number, direction: "in" | "out", isEstimate?: boolean): string {
  const sign = direction === "in" ? "+" : "-"
  return `- ${label}: ${sign}${amountMad} MAD${isEstimate ? " (estimate)" : ""}`
}

function buildVehicleInsightsPrompt(
  vehicleLabel: string,
  health: VehicleHealthResult,
  profitability: VehicleProfitabilityResult,
  utilization: VehicleUtilizationResult
): string {
  return [
    `Vehicle: ${vehicleLabel}`,
    "",
    `Health score: ${health.score}/100 (${health.band})`,
    ...health.factors.map((f) => formatFactorLine(f.label, f.score, f.weight)),
    "",
    `Profitability (net, all recorded history): ${profitability.netMad} MAD`,
    ...profitability.breakdown.map((b) => formatBreakdownLine(b.label, b.amountMad, b.direction, b.isEstimate)),
    "",
    `Utilization: ${utilization.occupancyRatePercent}% occupancy, ${utilization.idleDays} idle days, ${utilization.reservationCount} reservations, ${utilization.revenuePerDayMad} MAD/day when rented.`,
    "",
    "First, write a one-or-two sentence summary of what's happening with this vehicle right now — the single most important thing an owner glancing at this vehicle's page should know.",
    "Then, based only on this data, suggest up to 4 concrete actions a rental company owner could take for this vehicle — e.g. adjust its daily rate, schedule maintenance, consider retiring it, renew insurance. For each, give a brief observation, reasoning grounded in the numbers above, and a specific suggested action.",
    "Do not state anything the data above doesn't support. Plain business language, never chat-bot voice.",
  ].join("\n")
}

/** Generates a one/two-sentence status summary plus up to 4 grounded
 * recommendations from an already-computed health/profitability/
 * utilization snapshot. Allowed for owner/manager/agent — the union of
 * every role that can trigger a recompute in the first place:
 * completing a rental (RESERVATION_ROLES) and recording a damage
 * (DAMAGE_ROLES) both allow agent; completing maintenance
 * (MAINTENANCE_ROLES) is owner/manager only. Using the union rather
 * than the narrowest set means an agent's own rental-completion or
 * damage-recording action never silently fails to produce insights
 * while everything else about it succeeds — and the underlying health/
 * profitability/utilization data isn't role-restricted anywhere else in
 * this codebase either, so there's nothing a narrower gate here would
 * actually be protecting. */
export async function generateVehicleInsights(
  supabase: SupabaseServerClient,
  session: SessionContext,
  vehicleLabel: string,
  health: VehicleHealthResult,
  profitability: VehicleProfitabilityResult,
  utilization: VehicleUtilizationResult
): Promise<AskAiResult<VehicleInsights>> {
  return askAI(supabase, session, {
    purpose: "vehicle.insights",
    prompt: buildVehicleInsightsPrompt(vehicleLabel, health, profitability, utilization),
    schema: vehicleInsightsSchema,
    allowedRoles: ["owner", "manager", "agent"],
  })
}
