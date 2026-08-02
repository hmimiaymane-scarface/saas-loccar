import { describe, expect, it } from "vitest"

import { LAUNCH_RELIABILITY_CHECKS } from "../launch-reliability"

describe("LAUNCH_RELIABILITY_CHECKS", () => {
  it("has exactly 9 checks, matching the phase brief's named requirements", () => {
    expect(LAUNCH_RELIABILITY_CHECKS).toHaveLength(9)
  })

  it("has unique keys", () => {
    const keys = LAUNCH_RELIABILITY_CHECKS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("never leaves evidence blank, pass or not — no bare assertions", () => {
    for (const check of LAUNCH_RELIABILITY_CHECKS) {
      expect(check.evidence.length).toBeGreaterThan(0)
    }
  })

  it("only a 'pass' status carries a real lastVerified date — a not_verified check is never dated", () => {
    for (const check of LAUNCH_RELIABILITY_CHECKS) {
      if (check.status === "pass") expect(check.lastVerified).not.toBeNull()
      if (check.status === "not_verified") expect(check.lastVerified).toBeNull()
    }
  })

  it("never fakes a pass for a real-device requirement this environment can't execute", () => {
    const deviceChecks = LAUNCH_RELIABILITY_CHECKS.filter((c) => ["android", "iphone", "weak_network", "offline_recovery"].includes(c.key))
    expect(deviceChecks).toHaveLength(4)
    for (const check of deviceChecks) {
      expect(check.status).toBe("not_verified")
    }
  })
})
