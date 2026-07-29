import { describe, expect, it } from "vitest"

import { collapseDuplicateNotifications } from "../dedupe"
import type { NotificationItem } from "@/types/rental"

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "id_1",
    source: "event",
    type: "damage_recorded",
    title: "Damage recorded",
    description: null,
    priority: "important",
    href: "/damages/dmg_1",
    actions: [],
    isRead: false,
    createdAt: "2026-07-28T10:00:00.000Z",
    ...overrides,
  }
}

describe("collapseDuplicateNotifications", () => {
  it("keeps a single item unchanged", () => {
    const item = makeItem()
    expect(collapseDuplicateNotifications([item])).toEqual([item])
  })

  it("collapses two items sharing the same type and href, keeping the most recent", () => {
    const older = makeItem({ id: "id_1", createdAt: "2026-07-28T09:00:00.000Z" })
    const newer = makeItem({ id: "id_2", createdAt: "2026-07-28T10:00:00.000Z" })
    const result = collapseDuplicateNotifications([older, newer])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("id_2")
  })

  it("does not collapse items with different types even if href matches", () => {
    const a = makeItem({ id: "id_1", type: "damage_recorded", href: "/reservations/res_1" })
    const b = makeItem({ id: "id_2", type: "rental_overdue", href: "/reservations/res_1" })
    expect(collapseDuplicateNotifications([a, b])).toHaveLength(2)
  })

  it("does not collapse items with different hrefs even if type matches", () => {
    const a = makeItem({ id: "id_1", href: "/damages/dmg_1" })
    const b = makeItem({ id: "id_2", href: "/damages/dmg_2" })
    expect(collapseDuplicateNotifications([a, b])).toHaveLength(2)
  })

  it("never collapses items with no href, even if both are null", () => {
    const a = makeItem({ id: "id_1", href: null })
    const b = makeItem({ id: "id_2", href: null })
    expect(collapseDuplicateNotifications([a, b])).toHaveLength(2)
  })

  it("collapses 3 duplicates down to 1", () => {
    const items = [
      makeItem({ id: "id_1", createdAt: "2026-07-26T10:00:00.000Z" }),
      makeItem({ id: "id_2", createdAt: "2026-07-28T10:00:00.000Z" }),
      makeItem({ id: "id_3", createdAt: "2026-07-27T10:00:00.000Z" }),
    ]
    const result = collapseDuplicateNotifications(items)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("id_2")
  })

  it("returns an empty array for an empty input", () => {
    expect(collapseDuplicateNotifications([])).toEqual([])
  })
})
