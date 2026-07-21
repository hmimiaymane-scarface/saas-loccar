import type { ReturningCustomerReadiness } from "@/lib/customer-readiness"

/**
 * Roadmap phase 11 requirement 2 — "automatic validation before
 * generation... block generation with a specific, actionable error
 * rather than producing an incomplete contract." Pure: takes
 * already-resolved data (the same shapes `lib/contracts/context.ts`
 * and `lib/contracts/template-engine.ts` already produce), no
 * Supabase dependency, so every rule here is hand-fixture tested.
 *
 * Deliberately reuses phase 09's `ReturningCustomerReadiness` for the
 * "customer identity valid" check rather than a second, competing
 * definition of "verified" — but treats it as a *blocking error* here,
 * where phase 09 treats the same signal as advisory-only. That's a
 * real, deliberate difference: skipping a few clicks in the
 * reservation form is low stakes; generating an actual legal document
 * for a customer with an expired or missing ID is not. See
 * docs/contract-lifecycle.md.
 */

export interface ValidationIssue {
  code: string
  message: string
  severity: "error" | "warning"
}

export interface ValidateContractInput {
  customerReadiness: ReturningCustomerReadiness
  hasVehicle: boolean
  dailyRateMad: number
  totalMad: number
  numDays: number
  pickupAt: string
  returnAt: string
  renderedSections: { title: string; body: string }[]
}

const READINESS_MESSAGES: Record<string, string> = {
  licence_missing: "The customer has no driving licence expiry on file.",
  licence_expired: "The customer's driving licence has expired.",
  identity_missing: "The customer has no identity document on file.",
  identity_expired: "The customer's identity document has expired.",
}

export function validateContractGeneration(input: ValidateContractInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!input.customerReadiness.ready) {
    for (const issue of input.customerReadiness.issues) {
      issues.push({
        code: `customer_${issue.type}`,
        message: READINESS_MESSAGES[issue.type] ?? "The customer's identity could not be verified.",
        severity: "error",
      })
    }
  }

  if (!input.hasVehicle) {
    issues.push({
      code: "no_vehicle",
      message: "This reservation has no vehicle assigned yet — a contract needs a specific vehicle.",
      severity: "error",
    })
  }

  if (input.dailyRateMad < 0) {
    issues.push({ code: "invalid_daily_rate", message: "The daily rate can't be negative.", severity: "error" })
  }
  if (input.totalMad <= 0) {
    issues.push({ code: "invalid_total", message: "The total price must be greater than zero.", severity: "error" })
  }
  if (input.numDays < 1) {
    issues.push({ code: "invalid_duration", message: "The rental period must be at least one day.", severity: "error" })
  }
  if (new Date(input.returnAt).getTime() <= new Date(input.pickupAt).getTime()) {
    issues.push({ code: "invalid_dates", message: "The return date must be after the pickup date.", severity: "error" })
  }

  if (input.renderedSections.length === 0) {
    issues.push({
      code: "no_content",
      message: "The template produced no content for this reservation — every section was either empty or excluded by its condition.",
      severity: "error",
    })
  }

  for (const section of input.renderedSections) {
    if (section.body.includes("{{")) {
      issues.push({
        code: "missing_variable",
        message: `The "${section.title}" section still has an unresolved placeholder — check its wording.`,
        severity: "error",
      })
    }
  }

  return issues
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error")
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .filter((i) => i.severity === "error")
    .map((i) => i.message)
    .join(" ")
}
