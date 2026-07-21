/**
 * Roadmap phase 10 requirements 3-4 — pure rendering logic, zero
 * Supabase dependency, unit-tested against hand-built fixtures. Takes
 * an already-resolved flat `{ fieldPath: displayValue }` context (see
 * `lib/contracts/context.ts` for how that's built from real rows) and
 * a template's ordered sections, and produces the final document.
 *
 * Deliberately NOT a rules DSL (per the phase brief's own instruction
 * not to over-engineer requirement 4): one condition per section, one
 * of two operators. If a template ever needs "A and B", that's a
 * product decision for a later phase, not something to silently
 * approximate here.
 */

export type ConditionOperator = "equals" | "exists"

export interface SectionCondition {
  fieldPath: string
  operator: ConditionOperator
  /** Required for "equals", ignored for "exists". */
  value?: string
}

export interface TemplateSection {
  id: string
  title: string
  bodyText: string
  condition: SectionCondition | null
}

export interface RenderedSection {
  id: string
  title: string
  body: string
}

export type ContractContext = Record<string, string>

/**
 * "exists" means the field resolved to a real, non-empty value — not
 * just that the key is present in the map (a resolved-but-blank field,
 * e.g. a customer with no email, should NOT satisfy "exists").
 */
export function evaluateCondition(condition: SectionCondition | null, context: ContractContext): boolean {
  if (!condition) return true
  const actual = context[condition.fieldPath]
  if (condition.operator === "exists") return Boolean(actual && actual.trim().length > 0)
  return actual === condition.value
}

/** Unknown or unresolved placeholders are left visibly untouched
 * (`{{field.path}}`) rather than silently blanked — a blank in a legal
 * document reads as "nothing here," which is worse than an obviously
 * wrong token an owner will catch in review. */
export function substituteVariables(text: string, context: ContractContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, fieldPath: string) => {
    const value = context[fieldPath]
    return value != null && value !== "" ? value : match
  })
}

/** Filters out sections whose condition doesn't hold, then substitutes
 * variables in the rest — the two requirement-3/4 steps combined into
 * the one function every caller actually wants. Section order is
 * preserved exactly as authored. */
export function renderContractSections(sections: TemplateSection[], context: ContractContext): RenderedSection[] {
  return sections
    .filter((section) => evaluateCondition(section.condition, context))
    .map((section) => ({
      id: section.id,
      title: section.title,
      body: substituteVariables(section.bodyText, context),
    }))
}
