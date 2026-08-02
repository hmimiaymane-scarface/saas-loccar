import type { AiCallSummary, OperationalSummary, UsageAnalyticsSummary } from "@/types/platform"

/**
 * Roadmap phase 66 (Launch Performance Gate) — hard, numeric targets
 * for the 9 areas that phase's own brief names, plus the pure
 * evaluation logic that turns real measured data into a pass/fail per
 * criterion. See docs/launch-performance-gate.md for the full
 * rationale behind each number and how each one is actually measured.
 *
 * These threshold constants are the single source of truth — the real
 * instrumentation that logs a "slow" event (lib/contracts/template-store.ts#generateContract,
 * lib/storage-client.ts#uploadFile, app/(dashboard)/reservations/actions.ts#fetchCustomers)
 * imports these same values rather than each hand-rolling its own
 * number, so the doc, the live dashboard, and the actual logging
 * threshold can never quietly drift apart.
 */
export const CONTRACT_GENERATION_SLOW_MS = 5_000
export const UPLOAD_SLOW_MS = 8_000
export const SEARCH_SLOW_MS = 800

export type LaunchGateMeasurement = "automatic" | "manual"
export type LaunchGateStatus = "pass" | "fail" | "not_measured"

export interface LaunchGateCriterion {
  key: string
  area: string
  target: string
  measurement: LaunchGateMeasurement
  /** Only present for `measurement: "manual"` — how a human actually
   * checks this one before launch, since no live telemetry covers it. */
  manualMethod?: string
}

export const LAUNCH_GATE_CRITERIA: LaunchGateCriterion[] = [
  {
    key: "home_load",
    area: "Home load",
    target: "Overview page: server response under 1.5s, interactive under 3s on a mid-tier mobile connection",
    measurement: "manual",
    manualMethod: "Lighthouse / PageSpeed Insights run against a real deployed URL with realistic data volume, before each launch",
  },
  {
    key: "calendar_load",
    area: "Calendar",
    target: "Calendar page: server response under 1.5s, interactive under 3s on a mid-tier mobile connection",
    measurement: "manual",
    manualMethod: "Lighthouse / PageSpeed Insights run against a real deployed URL with realistic data volume, before each launch",
  },
  {
    key: "search",
    area: "Search",
    target: `Customer/vehicle search returns results within ${SEARCH_SLOW_MS}ms of the request`,
    measurement: "automatic",
  },
  {
    key: "new_rental_transitions",
    area: "New Rental step transitions",
    target: "Median time from start to completion under 3 minutes for an experienced staff member",
    measurement: "automatic",
  },
  {
    key: "photo_upload",
    area: "Photo upload",
    target: `A pickup/return/document photo finishes uploading within ${UPLOAD_SLOW_MS / 1000}s on a typical mobile connection`,
    measurement: "automatic",
  },
  {
    key: "return_workflow",
    area: "Return workflow",
    target: "Median time from start to completion under 2 minutes",
    measurement: "automatic",
  },
  {
    key: "contract_generation",
    area: "Contract generation",
    target: `A contract's PDF is rendered and stored within ${CONTRACT_GENERATION_SLOW_MS / 1000}s of the request`,
    measurement: "automatic",
  },
  {
    key: "error_rate",
    area: "Error rate",
    target: "AI-assisted call failure rate under 2%; no more than 5 frontend errors and 5 API-route errors per rolling 7 days",
    measurement: "automatic",
  },
  {
    key: "background_jobs",
    area: "Background jobs",
    target: "Zero unresolved cron job (operations feed, notification reminders) failures per rolling 7 days",
    measurement: "automatic",
  },
]

export interface LaunchGateResult extends LaunchGateCriterion {
  status: LaunchGateStatus
  /** A short, human-readable "what we actually measured" line — absent
   * for `not_measured` criteria (manual ones, or ones with no data yet). */
  currentValueLabel?: string
}

/**
 * Pure — takes the real (or mock) numbers this app already computes
 * and returns a pass/fail (or "not yet measured") per criterion above.
 * No criterion is ever silently skipped: a manual one always reports
 * `not_measured` with its own `manualMethod`, never a fake pass.
 */
export function evaluateLaunchGate(
  usage: UsageAnalyticsSummary,
  operational: OperationalSummary,
  aiCalls: AiCallSummary
): LaunchGateResult[] {
  const aiFailureRate = aiCalls.totalCalls > 0 ? aiCalls.failedCalls / aiCalls.totalCalls : null

  return LAUNCH_GATE_CRITERIA.map((criterion) => {
    if (criterion.measurement === "manual") {
      return { ...criterion, status: "not_measured" as const }
    }

    switch (criterion.key) {
      case "search": {
        if (operational.slowSearches === 0 && usage.searchQueryRun === 0) {
          return { ...criterion, status: "not_measured" as const }
        }
        return {
          ...criterion,
          status: operational.slowSearches === 0 ? ("pass" as const) : ("fail" as const),
          currentValueLabel: `${operational.slowSearches} slow search${operational.slowSearches === 1 ? "" : "es"} over ${operational.windowDays}d`,
        }
      }
      case "new_rental_transitions": {
        if (usage.newRentalMedianSeconds == null) return { ...criterion, status: "not_measured" as const }
        return {
          ...criterion,
          status: usage.newRentalMedianSeconds <= 180 ? ("pass" as const) : ("fail" as const),
          currentValueLabel: `median ${Math.round(usage.newRentalMedianSeconds)}s`,
        }
      }
      case "return_workflow": {
        if (usage.returnMedianSeconds == null) return { ...criterion, status: "not_measured" as const }
        return {
          ...criterion,
          status: usage.returnMedianSeconds <= 120 ? ("pass" as const) : ("fail" as const),
          currentValueLabel: `median ${Math.round(usage.returnMedianSeconds)}s`,
        }
      }
      case "photo_upload": {
        // Same "pass by absence" shape as contract_generation/background_jobs
        // below — uploadFile() only ever logs an event when an upload is
        // actually slow or failed, never a per-upload "it was fine" event,
        // so there's no total-attempts denominator to distinguish "nothing
        // uploaded yet" from "everything was fast." Zero evidence of a
        // problem is treated as passing, honestly, not as unmeasured.
        return {
          ...criterion,
          status: operational.uploadFailures === 0 ? ("pass" as const) : ("fail" as const),
          currentValueLabel: `${operational.uploadFailures} upload failure${operational.uploadFailures === 1 ? "" : "s"} over ${operational.windowDays}d`,
        }
      }
      case "contract_generation": {
        return {
          ...criterion,
          status: operational.slowContractGenerations === 0 ? ("pass" as const) : ("fail" as const),
          currentValueLabel: `${operational.slowContractGenerations} slow generation${operational.slowContractGenerations === 1 ? "" : "s"} over ${operational.windowDays}d`,
        }
      }
      case "error_rate": {
        const frontendAndApiOk = operational.frontendErrors <= 5 && operational.apiRouteErrors <= 5
        const aiOk = aiFailureRate == null || aiFailureRate <= 0.02
        const label =
          aiFailureRate != null
            ? `${operational.frontendErrors} frontend + ${operational.apiRouteErrors} API errors, ${(aiFailureRate * 100).toFixed(1)}% AI failure rate over ${operational.windowDays}d`
            : `${operational.frontendErrors} frontend + ${operational.apiRouteErrors} API errors over ${operational.windowDays}d (no AI calls yet)`
        return { ...criterion, status: frontendAndApiOk && aiOk ? ("pass" as const) : ("fail" as const), currentValueLabel: label }
      }
      case "background_jobs": {
        return {
          ...criterion,
          status: operational.cronJobFailures === 0 ? ("pass" as const) : ("fail" as const),
          currentValueLabel: `${operational.cronJobFailures} cron failure${operational.cronJobFailures === 1 ? "" : "s"} over ${operational.windowDays}d`,
        }
      }
      default:
        return { ...criterion, status: "not_measured" as const }
    }
  })
}
