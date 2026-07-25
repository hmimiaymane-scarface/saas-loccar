import { describe, expect, it } from "vitest"

import { filterByFinancialAccess, isFinancialNotificationType } from "../permission-filter"
import type { NotificationType } from "@/types/rental"

describe("isFinancialNotificationType", () => {
  it("flags payment-shaped notification types", () => {
    expect(isFinancialNotificationType("outstanding_balance")).toBe(true)
    expect(isFinancialNotificationType("deposit_unresolved")).toBe(true)
  })

  it("does not flag operational, non-financial types", () => {
    expect(isFinancialNotificationType("rental_overdue")).toBe(false)
    expect(isFinancialNotificationType("maintenance_due")).toBe(false)
    expect(isFinancialNotificationType("damage_recorded")).toBe(false)
  })
})

describe("filterByFinancialAccess — roadmap phase 18 requirement 7", () => {
  const items: { type: NotificationType; id: string }[] = [
    { type: "outstanding_balance", id: "a" },
    { type: "rental_overdue", id: "b" },
    { type: "deposit_unresolved", id: "c" },
    { type: "damage_recorded", id: "d" },
  ]

  it("a Cleaner/Mechanic-shaped session (no financial access) never receives payment-related notifications", () => {
    const visible = filterByFinancialAccess(items, false)
    expect(visible.map((i) => i.id)).toEqual(["b", "d"])
    expect(visible.some((i) => isFinancialNotificationType(i.type))).toBe(false)
  })

  it("a session with financial access sees every notification unfiltered", () => {
    const visible = filterByFinancialAccess(items, true)
    expect(visible).toHaveLength(4)
  })
})
