import { z } from "zod"

import { askAI, type AskAiResult } from "@/lib/ai/service"
import { createClient } from "@/lib/supabase/server"
import type { SessionContext } from "@/lib/auth/session"
import type { ContractContext } from "@/lib/contracts/template-engine"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Roadmap phase 11 requirement 8 (bible §17, "AI Assistance") — an
 * advisory layer on top of requirement 2's real validation
 * (`lib/contracts/validation.ts`), not a replacement for it: this
 * flags things a human should double-check (unusual pricing,
 * contradictory terms, a clause that seems to be missing), it never
 * blocks anything and never rewrites contract wording itself. The
 * distinction matters — validation issues are facts this codebase can
 * verify (a missing vehicle, an unresolved placeholder); these are
 * the model's own judgment calls, always presented as suggestions.
 */

const previewWarningsSchema = z.object({
  warnings: z
    .array(
      z.object({
        message: z.string().describe("One specific, plain-language observation — not generic advice."),
        severity: z.enum(["info", "warning"]).describe("warning for something that looks like a real problem, info for a minor note."),
      })
    )
    .describe("Empty array if nothing stands out — do not invent a warning just to have something to say."),
})

export type ContractPreviewWarning = z.infer<typeof previewWarningsSchema>["warnings"][number]

function buildPrompt(context: ContractContext, renderedSections: { title: string; body: string }[]): string {
  const facts = [
    `Daily rate: ${context["pricing.dailyRateMad"] ?? "unknown"}`,
    `Discount: ${context["pricing.discountMad"] ?? "0 MAD"}`,
    `Total: ${context["pricing.totalMad"] ?? "unknown"}`,
    `Pickup: ${context["reservation.pickupAt"] ?? "unknown"}`,
    `Return: ${context["reservation.returnAt"] ?? "unknown"}`,
    `Deposit expected: ${context["deposit.expectedAmountMad"] ?? "none on file"}`,
    `Deposit collected: ${context["deposit.collectedAmountMad"] ?? "none on file"}`,
  ].join("\n")

  const sections = renderedSections.map((s) => `--- ${s.title} ---\n${s.body}`).join("\n\n")

  return [
    "You are reviewing a car rental contract just before it's shown to an owner for final approval.",
    "Flag anything a human should double-check: pricing that looks unusually high or low for the stated rental period, clauses that contradict each other or the numbers above, or a clause that reads like something is missing (e.g. a deposit is mentioned but no amount appears anywhere).",
    "Do not flag anything that's simply unusual-but-plausible without a concrete reason. An empty warnings list is a completely normal, good result — most contracts have nothing wrong with them.",
    "Never suggest rewording the contract itself — only describe what you noticed.",
    "Plain business language, never chat-bot voice.",
    "",
    "=== KEY FACTS ===",
    facts,
    "",
    "=== CONTRACT SECTIONS ===",
    sections,
  ].join("\n")
}

export async function flagContractPreviewIssues(
  supabase: SupabaseServerClient,
  session: SessionContext,
  context: ContractContext,
  renderedSections: { title: string; body: string }[]
): Promise<AskAiResult<{ warnings: ContractPreviewWarning[] }>> {
  return askAI(supabase, session, {
    purpose: "contract.flag_preview_issues",
    prompt: buildPrompt(context, renderedSections),
    schema: previewWarningsSchema,
    allowedRoles: ["owner", "manager", "agent"],
  })
}
