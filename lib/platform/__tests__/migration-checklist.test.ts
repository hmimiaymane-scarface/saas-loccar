import { describe, expect, it } from "vitest"

import { MIGRATION_CHECKLIST_STEPS, migrationChecklistProgress } from "../migration-checklist"

describe("MIGRATION_CHECKLIST_STEPS", () => {
  it("has exactly 8 steps, matching the seed trigger's fixed list", () => {
    expect(MIGRATION_CHECKLIST_STEPS).toHaveLength(8)
  })

  it("has unique step keys", () => {
    const keys = MIGRATION_CHECKLIST_STEPS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("includes owner_login_created, matching the migration's pre-marked-done step", () => {
    expect(MIGRATION_CHECKLIST_STEPS.some((s) => s.key === "owner_login_created")).toBe(true)
  })
})

describe("migrationChecklistProgress", () => {
  it("counts done vs total", () => {
    expect(migrationChecklistProgress([{ isDone: true }, { isDone: false }, { isDone: true }])).toEqual({ done: 2, total: 3 })
  })

  it("returns 0/0 for an empty list", () => {
    expect(migrationChecklistProgress([])).toEqual({ done: 0, total: 0 })
  })

  it("returns done === total when every item is complete", () => {
    const result = migrationChecklistProgress([{ isDone: true }, { isDone: true }])
    expect(result.done).toBe(result.total)
  })
})
