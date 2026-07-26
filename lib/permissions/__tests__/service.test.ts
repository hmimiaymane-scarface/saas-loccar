import { describe, expect, it } from "vitest"

import { isSwitchOn, STAFF_ACCESS_SWITCHES } from "../service"
import type { PermissionOverrideInput } from "../resolve"

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

describe("isSwitchOn", () => {
  it("reads ON with no overrides at all — matches a Staff member's actual default access today", () => {
    expect(isSwitchOn("financial", [], NOW)).toBe(true)
    expect(isSwitchOn("edit_records", [], NOW)).toBe(true)
    expect(isSwitchOn("admin", [], NOW)).toBe(true)
  })

  it("a single-key switch reads OFF once its key is overridden false", () => {
    const overrides = [override({ permissionKey: "view_financial_reports", allowed: false })]
    expect(isSwitchOn("financial", overrides, NOW)).toBe(false)
  })

  it("a multi-key switch reads OFF if even one of its keys is overridden false", () => {
    const overrides = [override({ permissionKey: "manage_employees", allowed: false })]
    expect(isSwitchOn("admin", overrides, NOW)).toBe(false)
  })

  it("a multi-key switch stays ON only when every one of its keys is explicitly true", () => {
    const overrides = STAFF_ACCESS_SWITCHES.find((s) => s.id === "edit_records")!.keys.map((key) => override({ permissionKey: key, allowed: true }))
    expect(isSwitchOn("edit_records", overrides, NOW)).toBe(true)
  })

  it("an expired false override is ignored, falling back to the (true) default", () => {
    const overrides = [override({ permissionKey: "view_financial_reports", allowed: false, expiresAt: "2026-07-01T00:00:00Z" })]
    expect(isSwitchOn("financial", overrides, NOW)).toBe(true)
  })

  it("an unknown switch id reads OFF rather than throwing", () => {
    expect(isSwitchOn("not-a-real-switch", [], NOW)).toBe(false)
  })
})
