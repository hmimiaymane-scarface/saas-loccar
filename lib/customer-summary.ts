import { z } from "zod"

import { askAI, type AskAiResult } from "@/lib/ai/service"
import { createClient } from "@/lib/supabase/server"
import type { SessionContext } from "@/lib/auth/session"
import type { TrustScoreResult, CustomerLifetimeValueResult } from "@/lib/customer-intelligence"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Customer summary (roadmap phase 08 requirement 5): "a short customer
 * summary ('what kind of customer is this') for use in phase 09's
 * Customer Command Center — build the data/logic here, wire the UI
 * there." Data/logic only, per that instruction — nothing in this
 * phase renders it (non-goal: "no UI for the customer profile page
 * beyond what's needed to verify the scores compute correctly").
 */

const customerSummarySchema = z.object({
  summary: z
    .string()
    .describe(
      "One or two sentences on what kind of customer this is, in plain business language — not a paragraph, no chat-bot voice."
    ),
})

function formatFactorLine(label: string, score: number, weight: number): string {
  return `- ${label}: ${score}/100 (weight ${weight})`
}

function buildCustomerSummaryPrompt(
  customerLabel: string,
  trust: TrustScoreResult,
  clv: CustomerLifetimeValueResult
): string {
  return [
    `Customer: ${customerLabel}`,
    "",
    `Trust score: ${trust.score}/100 (${trust.band})`,
    ...trust.factors.map((f) => formatFactorLine(f.label, f.score, f.weight)),
    "",
    `Lifetime revenue: ${clv.lifetimeRevenueMad} MAD`,
    `Rental frequency: ${clv.rentalFrequencyPerYear} per year`,
    `Average reservation: ${clv.averageReservationMad} MAD`,
    `Preferred vehicle category: ${clv.preferredCategory ?? "not enough data yet"}`,
    "",
    "Based only on this data, write a one-or-two sentence summary of what kind of customer this is — the single most useful thing a staff member should know before interacting with them. Do not state anything the data above doesn't support. Plain business language, never chat-bot voice.",
  ].join("\n")
}

/** Owner/manager/agent/accountant — the full role set that can trigger
 * a customer_intelligence recompute (see the migration's RLS policy;
 * payments allow accountant, unlike vehicle triggers). Same "use the
 * union of everyone who can cause a recompute" reasoning as phase 06's
 * generateVehicleInsights. */
export async function generateCustomerSummary(
  supabase: SupabaseServerClient,
  session: SessionContext,
  customerLabel: string,
  trust: TrustScoreResult,
  clv: CustomerLifetimeValueResult
): Promise<AskAiResult<{ summary: string }>> {
  return askAI(supabase, session, {
    purpose: "customer.summarize",
    prompt: buildCustomerSummaryPrompt(customerLabel, trust, clv),
    schema: customerSummarySchema,
    allowedRoles: ["owner", "manager", "agent", "accountant"],
  })
}
