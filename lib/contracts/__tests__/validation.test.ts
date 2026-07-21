import { describe, expect, it } from "vitest"

import { validateContractGeneration, hasBlockingErrors, formatValidationIssues } from "@/lib/contracts/validation"

const READY = { ready: true, issues: [] }
const GOOD_INPUT = {
  customerReadiness: READY,
  hasVehicle: true,
  dailyRateMad: 380,
  totalMad: 1520,
  numDays: 4,
  pickupAt: "2026-07-15T10:00:00Z",
  returnAt: "2026-07-19T10:00:00Z",
  renderedSections: [{ title: "Renter", body: "Ahmed Tazi agrees to the terms." }],
}

describe("validateContractGeneration", () => {
  it("returns no issues for fully valid input", () => {
    expect(validateContractGeneration(GOOD_INPUT)).toEqual([])
  })

  it("blocks when the customer's identity isn't verified, one issue per readiness problem", () => {
    const issues = validateContractGeneration({
      ...GOOD_INPUT,
      customerReadiness: { ready: false, issues: [{ type: "licence_expired", expiresOn: "2026-01-01" }, { type: "identity_missing" }] },
    })
    expect(issues).toEqual([
      { code: "customer_licence_expired", message: "The customer's driving licence has expired.", severity: "error" },
      { code: "customer_identity_missing", message: "The customer has no identity document on file.", severity: "error" },
    ])
  })

  it("blocks when no vehicle is assigned", () => {
    const issues = validateContractGeneration({ ...GOOD_INPUT, hasVehicle: false })
    expect(issues).toEqual([{ code: "no_vehicle", message: expect.stringContaining("no vehicle assigned"), severity: "error" }])
  })

  it("blocks a negative daily rate", () => {
    const issues = validateContractGeneration({ ...GOOD_INPUT, dailyRateMad: -10 })
    expect(issues.map((i) => i.code)).toContain("invalid_daily_rate")
  })

  it("blocks a zero or negative total", () => {
    expect(validateContractGeneration({ ...GOOD_INPUT, totalMad: 0 }).map((i) => i.code)).toContain("invalid_total")
    expect(validateContractGeneration({ ...GOOD_INPUT, totalMad: -50 }).map((i) => i.code)).toContain("invalid_total")
  })

  it("blocks a rental shorter than one day", () => {
    expect(validateContractGeneration({ ...GOOD_INPUT, numDays: 0 }).map((i) => i.code)).toContain("invalid_duration")
  })

  it("blocks a return date on or before the pickup date", () => {
    const sameDay = validateContractGeneration({ ...GOOD_INPUT, returnAt: GOOD_INPUT.pickupAt })
    expect(sameDay.map((i) => i.code)).toContain("invalid_dates")
    const before = validateContractGeneration({ ...GOOD_INPUT, returnAt: "2026-07-10T10:00:00Z" })
    expect(before.map((i) => i.code)).toContain("invalid_dates")
  })

  it("blocks when the template produced zero sections", () => {
    const issues = validateContractGeneration({ ...GOOD_INPUT, renderedSections: [] })
    expect(issues.map((i) => i.code)).toContain("no_content")
  })

  it("blocks a section with a leftover unresolved placeholder", () => {
    const issues = validateContractGeneration({
      ...GOOD_INPUT,
      renderedSections: [{ title: "Deposit", body: "A deposit of {{deposit.collectedAmountMad}} was collected." }],
    })
    expect(issues).toEqual([
      { code: "missing_variable", message: expect.stringContaining('"Deposit"'), severity: "error" },
    ])
  })

  it("reports every problem at once, not just the first", () => {
    const issues = validateContractGeneration({
      ...GOOD_INPUT,
      hasVehicle: false,
      totalMad: 0,
      renderedSections: [],
    })
    expect(issues.map((i) => i.code).sort()).toEqual(["invalid_total", "no_content", "no_vehicle"].sort())
  })
})

describe("hasBlockingErrors / formatValidationIssues", () => {
  it("hasBlockingErrors is false for an empty list", () => {
    expect(hasBlockingErrors([])).toBe(false)
  })

  it("hasBlockingErrors is true when any issue is an error", () => {
    expect(hasBlockingErrors([{ code: "x", message: "x", severity: "error" }])).toBe(true)
  })

  it("hasBlockingErrors is false when every issue is only a warning", () => {
    expect(hasBlockingErrors([{ code: "x", message: "x", severity: "warning" }])).toBe(false)
  })

  it("formatValidationIssues joins only the error-severity messages", () => {
    const text = formatValidationIssues([
      { code: "a", message: "Problem A.", severity: "error" },
      { code: "b", message: "Just a heads up.", severity: "warning" },
      { code: "c", message: "Problem C.", severity: "error" },
    ])
    expect(text).toBe("Problem A. Problem C.")
  })
})
