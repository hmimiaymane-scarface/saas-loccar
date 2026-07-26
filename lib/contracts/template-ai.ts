import { z } from "zod"

import { askAI, type AskAiResult } from "@/lib/ai/service"
import { createClient } from "@/lib/supabase/server"
import type { SessionContext } from "@/lib/auth/session"
import { CONTRACT_VARIABLE_CATALOG } from "@/lib/contracts/variables"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Roadmap phase 10 requirement 1 — "using the AI service layer,
 * identify likely dynamic fields and propose a mapping." One call
 * through phase 05's `askAI()`, same as every other AI feature in this
 * codebase. The model is given the fixed field catalog and told never
 * to invent a field path outside it (still validated post-hoc by the
 * caller — `lib/contracts/template-store.ts` filters the response
 * through `isKnownContractField`, never trusts the model's word alone).
 *
 * Deliberately does NOT ask the model to fully define a section's
 * condition (operator + value) — only to flag that a section *looks*
 * situational. Requirement 4's condition model is simple by design,
 * but "this reads like a young-driver clause" and "trigger this when
 * flags.youngDriver equals true" are different claims of confidence;
 * only the first is something a text-reading model can actually
 * support. The owner configures the real condition during review.
 */

const templateMappingSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string().describe("A short heading for this clause, e.g. 'Rental Period', 'Deposit', 'Liability'."),
        bodyText: z
          .string()
          .describe(
            "This section's text, with specific mentions replaced by {{field.path}} tokens using ONLY field paths from the provided catalog. Leave wording untouched if nothing in the catalog fits."
          ),
        looksConditional: z
          .boolean()
          .describe("True if this section reads as situational rather than applying to every rental (e.g. a young-driver surcharge)."),
      })
    )
    .describe("The template's sections, in reading order."),
  variableMappings: z
    .array(
      z.object({
        placeholder: z.string().describe("The original placeholder/blank found in the template text, e.g. '[CUSTOMER NAME]'."),
        fieldPath: z.string().describe("The catalog field path this placeholder maps to."),
        label: z.string().describe("A short human-readable label for this mapping."),
      })
    )
    .describe("Every distinct placeholder detected and its proposed mapping."),
  notes: z.string().describe("One or two sentences on anything uncertain or ambiguous that needs the owner's attention before this goes live."),
})

export type ProposedTemplateMapping = z.infer<typeof templateMappingSchema>

function buildPrompt(extractedText: string): string {
  const catalog = CONTRACT_VARIABLE_CATALOG.map((v) => `- ${v.fieldPath}: ${v.label}`).join("\n")
  return [
    "You are turning a car rental company's existing paper contract (extracted below as plain text, formatting lost) into a reusable, data-driven template.",
    "",
    "Break it into logical sections in reading order. In each section's body text, replace customer/vehicle/rental-specific mentions with {{field.path}} tokens, using ONLY these known fields:",
    catalog,
    "",
    "Never invent a field path outside this list. If a mention doesn't clearly match any of these fields, leave the original wording as-is rather than guessing.",
    "",
    "Flag looksConditional=true for a section that reads as situational rather than universal (an optional clause, a surcharge that only sometimes applies) — do not guess what triggers it, a human configures that afterward.",
    "",
    "Separately, list every distinct placeholder or blank you found in the original text (e.g. '[CUSTOMER NAME]', 'the Renter, ______') and which field it maps to.",
    "",
    "Plain business language in any notes you write, never chat-bot voice.",
    "",
    "=== TEMPLATE TEXT ===",
    extractedText,
  ].join("\n")
}

export async function proposeContractTemplateMapping(
  supabase: SupabaseServerClient,
  session: SessionContext,
  extractedText: string
): Promise<AskAiResult<ProposedTemplateMapping>> {
  return askAI(supabase, session, {
    purpose: "contract.propose_template_mapping",
    prompt: buildPrompt(extractedText),
    schema: templateMappingSchema,
    allowedRoles: ["owner", "manager"],
  })
}
