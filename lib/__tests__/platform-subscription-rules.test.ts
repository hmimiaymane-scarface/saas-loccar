import { describe, expect, it } from "vitest"

import { isAccountBlocked, isTrialEndingSoon, canReactivate } from "../platform/subscription-rules"

describe("isAccountBlocked", () => {
  it("blocks suspended accounts", () => {
    expect(isAccountBlocked("suspended")).toBe(true)
  })

  it("blocks cancelled accounts", () => {
    expect(isAccountBlocked("cancelled")).toBe(true)
  })

  it("never blocks a trial account", () => {
    expect(isAccountBlocked("trial")).toBe(false)
  })

  it("never blocks an active account", () => {
    expect(isAccountBlocked("active")).toBe(false)
  })
})

describe("isTrialEndingSoon", () => {
  it("flags a trial ending within the default 7-day window", () => {
    expect(isTrialEndingSoon("trial", "2026-07-25", "2026-07-19")).toBe(true)
  })

  it("flags a trial ending today", () => {
    expect(isTrialEndingSoon("trial", "2026-07-19", "2026-07-19")).toBe(true)
  })

  it("does not flag a trial ending well beyond the window", () => {
    expect(isTrialEndingSoon("trial", "2026-08-15", "2026-07-19")).toBe(false)
  })

  it("does not flag a trial that already ended", () => {
    expect(isTrialEndingSoon("trial", "2026-07-01", "2026-07-19")).toBe(false)
  })

  it("never flags a non-trial status regardless of the date", () => {
    expect(isTrialEndingSoon("active", "2026-07-20", "2026-07-19")).toBe(false)
  })

  it("returns false when there is no trial end date", () => {
    expect(isTrialEndingSoon("trial", null, "2026-07-19")).toBe(false)
  })

  it("respects a custom threshold", () => {
    expect(isTrialEndingSoon("trial", "2026-07-30", "2026-07-19", 14)).toBe(true)
    expect(isTrialEndingSoon("trial", "2026-07-30", "2026-07-19", 7)).toBe(false)
  })
})

describe("canReactivate", () => {
  it("allows reactivating a suspended account", () => {
    expect(canReactivate("suspended")).toBe(true)
  })

  it("does not treat cancellation as reactivatable in place", () => {
    expect(canReactivate("cancelled")).toBe(false)
  })

  it("is false for trial and active — there's nothing to reactivate", () => {
    expect(canReactivate("trial")).toBe(false)
    expect(canReactivate("active")).toBe(false)
  })
})
