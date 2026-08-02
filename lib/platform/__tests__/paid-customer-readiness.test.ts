import { describe, expect, it } from "vitest"

import { PAID_CUSTOMER_READINESS_CHECKS } from "../paid-customer-readiness"

describe("PAID_CUSTOMER_READINESS_CHECKS", () => {
  it("has exactly 10 checks, matching the phase brief's named requirements", () => {
    expect(PAID_CUSTOMER_READINESS_CHECKS).toHaveLength(10)
  })

  it("has unique keys", () => {
    const keys = PAID_CUSTOMER_READINESS_CHECKS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("never leaves evidence blank, pass or not — no bare assertions", () => {
    for (const check of PAID_CUSTOMER_READINESS_CHECKS) {
      expect(check.evidence.length).toBeGreaterThan(0)
    }
  })

  it("only a 'pass' status carries a real lastVerified date", () => {
    for (const check of PAID_CUSTOMER_READINESS_CHECKS) {
      if (check.status === "pass") expect(check.lastVerified).not.toBeNull()
      if (check.status === "not_verified") expect(check.lastVerified).toBeNull()
    }
  })

  it("never fakes a pass for the 3 requirements the unapplied-migrations gap actually blocks", () => {
    const blocked = PAID_CUSTOMER_READINESS_CHECKS.filter((c) =>
      ["real_database", "support_path_exists", "monitoring_exists"].includes(c.key)
    )
    expect(blocked).toHaveLength(3)
    for (const check of blocked) {
      expect(check.status).toBe("fail")
      expect(check.evidence).toMatch(/migration/i)
    }
  })
})
