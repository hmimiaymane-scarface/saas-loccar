import { describe, expect, it } from "vitest"

import { recomputeMissingHandoffPhotosBestEffort } from "@/lib/operations-feed/realtime"

/** Narrow fake, scoped to exactly the 3 tables this one real-time
 * trigger touches (inspections, media, operations_feed_items) — same
 * "not a general-purpose mock" philosophy as every other fake-Supabase
 * test helper in this repo. */
function makeFakeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    inspections: [],
    reservations: [],
    media: [],
    operations_feed_items: [],
  }
  let nextId = 1

  function matchesFilters(row: Record<string, unknown>, filters: [string, unknown][]) {
    return filters.every(([key, value]) => (Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
  }

  function withEmbeds(table: string, row: Record<string, unknown>) {
    if (table === "inspections" && "reservation_id" in row) {
      return { ...row, reservation: tables.reservations.find((r) => r.id === row.reservation_id) ?? null }
    }
    return row
  }

  function queryBuilder(table: string) {
    const filters: [string, unknown][] = []
    const builder = {
      eq(key: string, value: unknown) {
        filters.push([key, value])
        return builder
      },
      in(key: string, values: unknown[]) {
        filters.push([key, values])
        return builder
      },
      select() {
        return builder
      },
      rows() {
        return tables[table].filter((r) => matchesFilters(r, filters)).map((r) => withEmbeds(table, r))
      },
      maybeSingle() {
        return Promise.resolve({ data: builder.rows()[0] ?? null, error: null })
      },
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        resolve({ data: builder.rows(), error: null })
      },
      insert(row: Record<string, unknown>) {
        const inserted = { id: `item_${nextId++}`, ...row }
        tables[table].push(inserted)
        return Promise.resolve({ error: null })
      },
      update(patch: Record<string, unknown>) {
        return {
          eq(key: string, value: unknown) {
            const row = tables[table].find((r) => r[key] === value)
            if (row) Object.assign(row, patch)
            return Promise.resolve({ error: null })
          },
        }
      },
    }
    return builder
  }

  return { client: { from: (table: string) => queryBuilder(table) } as never, tables }
}

const COMPANY = "co_1"

describe("recomputeMissingHandoffPhotosBestEffort", () => {
  it("opens an item when a draft inspection is missing a required photo", async () => {
    const { client, tables } = makeFakeSupabase()
    tables.reservations.push({ id: "res_1", company_id: COMPANY, reference: "RB-1" })
    tables.inspections.push({ id: "insp_1", company_id: COMPANY, reservation_id: "res_1", type: "pickup", status: "draft" })
    tables.media.push({ id: "med_1", company_id: COMPANY, entity_type: "inspection", entity_id: "insp_1", caption: "dashboard_odometer" })

    await recomputeMissingHandoffPhotosBestEffort(client, COMPANY, "insp_1", new Date("2026-07-28T12:00:00Z"))

    expect(tables.operations_feed_items).toHaveLength(1)
    expect(tables.operations_feed_items[0]).toMatchObject({ observer_type: "missing_handoff_photos", entity_id: "insp_1", status: "open" })
  })

  it("resolves an already-open item once the missing photo gets captured", async () => {
    const { client, tables } = makeFakeSupabase()
    tables.reservations.push({ id: "res_1", company_id: COMPANY, reference: "RB-1" })
    tables.inspections.push({ id: "insp_1", company_id: COMPANY, reservation_id: "res_1", type: "pickup", status: "draft" })
    tables.operations_feed_items.push({
      id: "item_1",
      company_id: COMPANY,
      observer_type: "missing_handoff_photos",
      entity_type: "inspection",
      entity_id: "insp_1",
      status: "open",
    })
    // Both required photos now present.
    tables.media.push(
      { id: "med_1", company_id: COMPANY, entity_type: "inspection", entity_id: "insp_1", caption: "dashboard_odometer" },
      { id: "med_2", company_id: COMPANY, entity_type: "inspection", entity_id: "insp_1", caption: "fuel_gauge" }
    )

    await recomputeMissingHandoffPhotosBestEffort(client, COMPANY, "insp_1", new Date("2026-07-28T12:00:00Z"))

    expect(tables.operations_feed_items[0]).toMatchObject({ status: "resolved" })
  })

  it("does nothing for a completed inspection — that path is impossible to usefully check here", async () => {
    const { client, tables } = makeFakeSupabase()
    tables.reservations.push({ id: "res_1", company_id: COMPANY, reference: "RB-1" })
    tables.inspections.push({ id: "insp_1", company_id: COMPANY, reservation_id: "res_1", type: "pickup", status: "completed" })

    await recomputeMissingHandoffPhotosBestEffort(client, COMPANY, "insp_1", new Date("2026-07-28T12:00:00Z"))

    expect(tables.operations_feed_items).toHaveLength(0)
  })

  it("never throws even when the inspection doesn't exist (best-effort)", async () => {
    const { client } = makeFakeSupabase()
    await expect(recomputeMissingHandoffPhotosBestEffort(client, COMPANY, "does_not_exist")).resolves.toBeUndefined()
  })
})
