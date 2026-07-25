import { describe, expect, it } from "vitest"

import { hasPermission, isOverrideActive, type PermissionOverrideInput } from "../resolve"

const NOW = new Date("2026-07-25T12:00:00Z")

function override(partial: Partial<PermissionOverrideInput>): PermissionOverrideInput {
  return {
    permissionKey: "view_financial_reports",
    allowed: true,
    expiresAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    ...partial,
  }
}

describe("hasPermission", () => {
  it("falls back to the role default when there is no override", () => {
    expect(hasPermission("view_customers", ["view_customers"], [], NOW)).toBe(true)
    expect(hasPermission("view_customers", [], [], NOW)).toBe(false)
  })

  it("denies by default when neither an override nor a role default matches", () => {
    expect(hasPermission("manage_employees", ["view_customers"], [], NOW)).toBe(false)
  })

  it("a permanent override wins over a false role default", () => {
    const overrides = [override({ permissionKey: "view_financial_reports", allowed: true, expiresAt: null })]
    expect(hasPermission("view_financial_reports", [], overrides, NOW)).toBe(true)
  })

  it("an override can also revoke something the role default would allow", () => {
    const overrides = [override({ permissionKey: "record_payments", allowed: false, expiresAt: null })]
    expect(hasPermission("record_payments", ["record_payments"], overrides, NOW)).toBe(false)
  })

  it("a future-expiring override is still active", () => {
    const overrides = [override({ expiresAt: "2026-08-01T00:00:00Z" })]
    expect(hasPermission("view_financial_reports", [], overrides, NOW)).toBe(true)
  })

  it("an expired override is ignored, falling back to the role default", () => {
    const overrides = [override({ expiresAt: "2026-07-01T00:00:00Z", allowed: true })]
    expect(hasPermission("view_financial_reports", [], overrides, NOW)).toBe(false)
  })

  it("an override expiring at exactly now is treated as expired", () => {
    const overrides = [override({ expiresAt: NOW.toISOString() })]
    expect(isOverrideActive(overrides[0], NOW)).toBe(false)
  })

  it("when multiple overrides exist for the same key, the most recently created one wins", () => {
    const overrides = [
      override({ allowed: true, createdAt: "2026-07-01T00:00:00Z" }),
      override({ allowed: false, createdAt: "2026-07-20T00:00:00Z" }),
    ]
    expect(hasPermission("view_financial_reports", ["view_financial_reports"], overrides, NOW)).toBe(false)
  })

  it("ignores overrides for a different permission key", () => {
    const overrides = [override({ permissionKey: "manage_vehicles", allowed: true })]
    expect(hasPermission("view_financial_reports", [], overrides, NOW)).toBe(false)
  })
})
