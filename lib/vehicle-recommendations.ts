import { z } from "zod"

import { askAI, type AskAiResult } from "@/lib/ai/service"
import { createClient } from "@/lib/supabase/server"
import type { SessionContext } from "@/lib/auth/session"
import type { VehicleHealthResult, VehicleProfitabilityResult, VehicleUtilizationResult } from "@/lib/vehicle-intelligence"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Vehicle Recommendations (roadmap phase 06 requirement 4) — the first
 * real caller of phase 05's askAI() service. Advisory only: "AI may
 * recommend. Humans decide." (bible, non-negotiable) — nothing here
 * writes to any operational table, it only produces text for
 * components/domain/intelligence/ai-recommendation-card.tsx to render,
 * with an Accept/Dismiss the human controls, same propose-then-confirm
 * spirit as the AI Assistant's tools (lib/ai/tools.ts).
 */

export interface VehicleRecommendation {
  observation: string
  reasoning: string
  suggestedAction: string
}

const vehicleRecommendationSchema = z.object({
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

function buildVehicleRecommendationPrompt(
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
    "Based only on this data, suggest up to 4 concrete actions a rental company owner could take for this vehicle — e.g. adjust its daily rate, schedule maintenance, consider retiring it, renew insurance. For each, give a brief observation, reasoning grounded in the numbers above, and a specific suggested action. Do not suggest anything the data above doesn't support. Plain business language, never chat-bot voice.",
  ].join("\n")
}

/** Generates up to 4 grounded recommendations from an already-computed
 * health/profitability/utilization snapshot. Owner/manager only —
 * pricing and retirement decisions are a strategic call, not an
 * operational one an agent role makes day to day (matches this
 * codebase's existing role split, e.g. CUSTOMER_STATUS_ROLES). */
export async function generateVehicleRecommendations(
  supabase: SupabaseServerClient,
  session: SessionContext,
  vehicleLabel: string,
  health: VehicleHealthResult,
  profitability: VehicleProfitabilityResult,
  utilization: VehicleUtilizationResult
): Promise<AskAiResult<{ recommendations: VehicleRecommendation[] }>> {
  return askAI(supabase, session, {
    purpose: "vehicle.recommend",
    prompt: buildVehicleRecommendationPrompt(vehicleLabel, health, profitability, utilization),
    schema: vehicleRecommendationSchema,
    allowedRoles: ["owner", "manager"],
  })
}
