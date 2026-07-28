import { describe, expect, it } from "vitest"

import { upsertOperationsFeedItem } from "@/lib/operations-feed/upsert"
import type { FeedItemDraft } from "@/lib/operations-feed/types"

/** A minimal fake, scoped to just `operations_feed_items` — this
 * function only ever inserts or updates that one table, one row at a
 * time. Narrow on purpose, same "not a general-purpose Supabase mock"
 * philosophy as `lib/contracts/__tests__/template-store.test.ts`'s own
 * fake. */
function makeFakeSupabase() {
  const rows: Record<string, unknown>[] = []

  return {
    rows,
    client: {
      from(table: string) {
        if (table !== "operations_feed_items") throw new Error(`unexpected table ${table}`)
        return {
          insert(row: Record<string, unknown>) {
            rows.push({ id: `item_${rows.length + 1}`, ...row })
            return Promise.resolve({ error: null })
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(key: string, value: unknown) {
                const row = rows.find((r) => r[key] === value)
                if (row) Object.assign(row, patch)
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }
}

const DRAFT: FeedItemDraft = {
  observerType: "missing_handoff_photos",
  entityType: "inspection",
  entityId: "insp_1",
  priorityTier: "operational",
  observation: "RB-1's pickup inspection is missing a fuel level photo.",
  reasoning: "No fallback record if the fuel level is ever disputed.",
  suggestedAction: "Add the missing fuel level photo.",
  actionLabel: "Open",
  actionHref: "/reservations/res_1",
  confidence: "high",
}

const KEY = { observerType: DRAFT.observerType, entityType: DRAFT.entityType, entityId: DRAFT.entityId }
const NOW = new Date("2026-07-28T12:00:00.000Z")

describe("upsertOperationsFeedItem", () => {
  it("opens a new item when a draft exists and there's no existing row", async () => {
    const { client, rows } = makeFakeSupabase()
    const action = await upsertOperationsFeedItem(client, "co_1", KEY, DRAFT, undefined, NOW)
    expect(action).toBe("opened")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "open", observation: DRAFT.observation })
  })

  it("updates an existing open item's content and last_seen_at", async () => {
    const { client, rows } = makeFakeSupabase()
    rows.push({ id: "item_1", status: "open", observation: "stale text" })
    const action = await upsertOperationsFeedItem(client, "co_1", KEY, DRAFT, { id: "item_1", status: "open" }, NOW)
    expect(action).toBe("updated")
    expect(rows[0]).toMatchObject({ observation: DRAFT.observation, last_seen_at: NOW.toISOString() })
  })

  it("leaves a dismissed item completely untouched even though the condition still holds", async () => {
    const { client, rows } = makeFakeSupabase()
    rows.push({ id: "item_1", status: "dismissed", observation: "original text" })
    const action = await upsertOperationsFeedItem(client, "co_1", KEY, DRAFT, { id: "item_1", status: "dismissed" }, NOW)
    expect(action).toBe("left_dismissed")
    expect(rows[0].observation).toBe("original text")
  })

  it("resolves an open item once the condition no longer holds (draft is null)", async () => {
    const { client, rows } = makeFakeSupabase()
    rows.push({ id: "item_1", status: "open" })
    const action = await upsertOperationsFeedItem(client, "co_1", KEY, null, { id: "item_1", status: "open" }, NOW)
    expect(action).toBe("resolved")
    expect(rows[0]).toMatchObject({ status: "resolved", resolved_at: NOW.toISOString() })
  })

  it("resolves a dismissed item too, once the condition no longer holds", async () => {
    const { client, rows } = makeFakeSupabase()
    rows.push({ id: "item_1", status: "dismissed" })
    const action = await upsertOperationsFeedItem(client, "co_1", KEY, null, { id: "item_1", status: "dismissed" }, NOW)
    expect(action).toBe("resolved")
  })

  it("does nothing when there's no draft and no existing row", async () => {
    const { client, rows } = makeFakeSupabase()
    const action = await upsertOperationsFeedItem(client, "co_1", KEY, null, undefined, NOW)
    expect(action).toBe("unchanged")
    expect(rows).toHaveLength(0)
  })
})
