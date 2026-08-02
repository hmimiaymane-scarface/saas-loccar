import { describe, expect, it } from "vitest"

import { LAUNCH_GATE_CRITERIA, evaluateLaunchGate } from "../launch-gate"
import type { AiCallSummary, OperationalSummary, UsageAnalyticsSummary } from "@/types/platform"

const baseUsage: UsageAnalyticsSummary = {
  windowDays: 7,
  newRentalStarted: 0,
  newRentalCompleted: 0,
  newRentalMedianSeconds: null,
  returnStarted: 0,
  returnCompleted: 0,
  returnMedianSeconds: null,
  searchOpened: 0,
  searchQueryRun: 0,
  quickActionUsed: 0,
  alertActionUsed: 0,
  errorOccurred: 0,
  importCompleted: 0,
  pwaInstallAccepted: 0,
  pwaInstallDismissed: 0,
  pwaInstalled: 0,
}

const baseOperational: OperationalSummary = {
  windowDays: 7,
  frontendErrors: 0,
  apiRouteErrors: 0,
  cronJobFailures: 0,
  notificationFailures: 0,
  uploadFailures: 0,
  slowRoutes: 0,
  slowContractGenerations: 0,
  slowSearches: 0,
}

const baseAiCalls: AiCallSummary = { windowDays: 7, totalCalls: 0, failedCalls: 0 }

describe("LAUNCH_GATE_CRITERIA", () => {
  it("has exactly 9 criteria, matching the phase brief's named areas", () => {
    expect(LAUNCH_GATE_CRITERIA).toHaveLength(9)
  })

  it("has unique keys", () => {
    const keys = LAUNCH_GATE_CRITERIA.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("every manual criterion carries its own manualMethod, never a silent gap", () => {
    for (const c of LAUNCH_GATE_CRITERIA) {
      if (c.measurement === "manual") expect(c.manualMethod).toBeTruthy()
    }
  })
})

describe("evaluateLaunchGate", () => {
  it("reports the 2 page-load criteria as not_measured — no fake pass for what isn't instrumented", () => {
    const results = evaluateLaunchGate(baseUsage, baseOperational, baseAiCalls)
    const homeLoad = results.find((r) => r.key === "home_load")
    const calendarLoad = results.find((r) => r.key === "calendar_load")
    expect(homeLoad?.status).toBe("not_measured")
    expect(calendarLoad?.status).toBe("not_measured")
  })

  it("passes new_rental_transitions and return_workflow when their medians are under target", () => {
    const results = evaluateLaunchGate(
      { ...baseUsage, newRentalMedianSeconds: 150, returnMedianSeconds: 90 },
      baseOperational,
      baseAiCalls
    )
    expect(results.find((r) => r.key === "new_rental_transitions")?.status).toBe("pass")
    expect(results.find((r) => r.key === "return_workflow")?.status).toBe("pass")
  })

  it("fails new_rental_transitions and return_workflow when their medians exceed target", () => {
    const results = evaluateLaunchGate(
      { ...baseUsage, newRentalMedianSeconds: 300, returnMedianSeconds: 200 },
      baseOperational,
      baseAiCalls
    )
    expect(results.find((r) => r.key === "new_rental_transitions")?.status).toBe("fail")
    expect(results.find((r) => r.key === "return_workflow")?.status).toBe("fail")
  })

  it("reports not_measured for the funnels when no data has been collected yet", () => {
    const results = evaluateLaunchGate(baseUsage, baseOperational, baseAiCalls)
    expect(results.find((r) => r.key === "new_rental_transitions")?.status).toBe("not_measured")
    expect(results.find((r) => r.key === "return_workflow")?.status).toBe("not_measured")
  })

  it("passes contract_generation and photo_upload by absence of any slow/failed events logged", () => {
    const results = evaluateLaunchGate(baseUsage, baseOperational, baseAiCalls)
    expect(results.find((r) => r.key === "contract_generation")?.status).toBe("pass")
    expect(results.find((r) => r.key === "photo_upload")?.status).toBe("pass")
  })

  it("fails contract_generation and photo_upload once a slow/failed event has been logged", () => {
    const results = evaluateLaunchGate(
      baseUsage,
      { ...baseOperational, slowContractGenerations: 1, uploadFailures: 2 },
      baseAiCalls
    )
    expect(results.find((r) => r.key === "contract_generation")?.status).toBe("fail")
    expect(results.find((r) => r.key === "photo_upload")?.status).toBe("fail")
  })

  it("search is not_measured until it's actually been used, then passes/fails on slow-search count", () => {
    const unused = evaluateLaunchGate(baseUsage, baseOperational, baseAiCalls)
    expect(unused.find((r) => r.key === "search")?.status).toBe("not_measured")

    const usedAndFast = evaluateLaunchGate({ ...baseUsage, searchQueryRun: 40 }, baseOperational, baseAiCalls)
    expect(usedAndFast.find((r) => r.key === "search")?.status).toBe("pass")

    const usedAndSlow = evaluateLaunchGate({ ...baseUsage, searchQueryRun: 40 }, { ...baseOperational, slowSearches: 3 }, baseAiCalls)
    expect(usedAndSlow.find((r) => r.key === "search")?.status).toBe("fail")
  })

  it("error_rate combines frontend/API counts and the real AI failure rate, failing if either breaches its own threshold", () => {
    const withinBounds = evaluateLaunchGate(baseUsage, { ...baseOperational, frontendErrors: 2, apiRouteErrors: 1 }, { windowDays: 7, totalCalls: 100, failedCalls: 1 })
    expect(withinBounds.find((r) => r.key === "error_rate")?.status).toBe("pass")

    const tooManyFrontendErrors = evaluateLaunchGate(baseUsage, { ...baseOperational, frontendErrors: 6 }, baseAiCalls)
    expect(tooManyFrontendErrors.find((r) => r.key === "error_rate")?.status).toBe("fail")

    const aiFailureRateTooHigh = evaluateLaunchGate(baseUsage, baseOperational, { windowDays: 7, totalCalls: 100, failedCalls: 5 })
    expect(aiFailureRateTooHigh.find((r) => r.key === "error_rate")?.status).toBe("fail")
  })

  it("background_jobs passes with zero cron failures and fails otherwise", () => {
    const clean = evaluateLaunchGate(baseUsage, baseOperational, baseAiCalls)
    expect(clean.find((r) => r.key === "background_jobs")?.status).toBe("pass")

    const failing = evaluateLaunchGate(baseUsage, { ...baseOperational, cronJobFailures: 1 }, baseAiCalls)
    expect(failing.find((r) => r.key === "background_jobs")?.status).toBe("fail")
  })
})
