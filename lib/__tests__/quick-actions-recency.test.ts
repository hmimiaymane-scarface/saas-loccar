import { describe, expect, it } from "vitest"

import { orderByRecency } from "../quick-actions-recency"

const actions = [
  { label: "Return Vehicle" },
  { label: "Record Payment" },
  { label: "Add Expense" },
  { label: "Add Customer" },
  { label: "Add Vehicle" },
]

describe("orderByRecency", () => {
  it("keeps the original order when there's no recency history", () => {
    expect(orderByRecency(actions, [])).toEqual(actions)
  })

  it("moves the most recently used action to the front", () => {
    const result = orderByRecency(actions, ["Add Expense"])
    expect(result[0].label).toBe("Add Expense")
    expect(result.slice(1).map((a) => a.label)).toEqual(["Return Vehicle", "Record Payment", "Add Customer", "Add Vehicle"])
  })

  it("orders multiple recently-used actions by recency, most recent first", () => {
    const result = orderByRecency(actions, ["Add Vehicle", "Return Vehicle"])
    expect(result.map((a) => a.label)).toEqual(["Add Vehicle", "Return Vehicle", "Record Payment", "Add Expense", "Add Customer"])
  })

  it("appends never-used actions after every used one, in their original relative order", () => {
    const result = orderByRecency(actions, ["Add Customer"])
    expect(result.map((a) => a.label)).toEqual(["Add Customer", "Return Vehicle", "Record Payment", "Add Expense", "Add Vehicle"])
  })

  it("ignores a recency entry that no longer matches any action", () => {
    const result = orderByRecency(actions, ["Scan Document", "Add Vehicle"])
    expect(result[0].label).toBe("Add Vehicle")
    expect(result).toHaveLength(5)
  })
})
