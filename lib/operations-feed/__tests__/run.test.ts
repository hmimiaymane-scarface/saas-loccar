import { describe, expect, it, vi, beforeEach } from "vitest"

const pricingAiMock = vi.hoisted(() => ({ reviewPricingOutliers: vi.fn(async () => ({ ok: true as const, data: { reviews: [] }, confidence: "high" as const, modelId: "test" })) }))
vi.mock("@/lib/operations-feed/pricing-ai", () => pricingAiMock)

import { runOperationsFeedForCompany } from "@/lib/operations-feed/run"

/** Same shape/spirit as lib/contracts/__tests__/template-store.test.ts's
 * fake — real mutable per-table state (not canned responses), because
 * `run.ts` reads and writes `operations_feed_items` across multiple
 * sequential calls within one run, and these tests specifically need
 * to observe reconciliation behavior (open -> resolved,
 * dismissed -> untouched) across two separate `runOperationsFeedForCompany`
 * calls simulating two job runs. */
function makeFakeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    vehicles: [],
    reservations: [],
    companies: [],
    documents: [],
    customers: [],
    customer_intelligence: [],
    vehicle_intelligence: [],
    inspections: [],
    media: [],
    operations_feed_items: [],
  }
  let nextId = 1

  function matchesFilters(row: Record<string, unknown>, filters: [string, unknown][]) {
    return filters.every(([key, value]) => {
      if (Array.isArray(value)) return value.includes(row[key])
      if (key.startsWith("not_in:")) return !(value as unknown[]).includes(row[key.slice(7)])
      return row[key] === value
    })
  }

  function withEmbeds(table: string, row: Record<string, unknown>): Record<string, unknown> {
    const embedded = { ...row }
    if (table === "reservations" && "vehicle_id" in row) {
      embedded.vehicle = tables.vehicles.find((v) => v.id === row.vehicle_id) ?? null
    }
    if (table === "inspections" && "reservation_id" in row) {
      embedded.reservation = tables.reservations.find((r) => r.id === row.reservation_id) ?? null
    }
    return embedded
  }

  function queryBuilder(table: string) {
    if (!tables[table]) tables[table] = []
    const filters: [string, unknown][] = []
    let notInFilter: [string, unknown[]] | null = null
    let notNullKey: string | null = null
    const rangeFilters: [string, "lte" | "gte", unknown][] = []

    const builder = {
      eq(key: string, value: unknown) {
        filters.push([key, value])
        return builder
      },
      in(key: string, values: unknown[]) {
        filters.push([key, values])
        return builder
      },
      not(key: string, op: string, value: string | null) {
        if (op === "is" && value === null) {
          notNullKey = key
        } else if (typeof value === "string") {
          // `.not("id","in","(...)")` — parse the parenthesized csv.
          notInFilter = [key, value.replace(/[()]/g, "").split(",").filter(Boolean)]
        }
        return builder
      },
      lte(key: string, value: unknown) {
        rangeFilters.push([key, "lte", value])
        return builder
      },
      gte(key: string, value: unknown) {
        rangeFilters.push([key, "gte", value])
        return builder
      },
      order() {
        return builder
      },
      rows() {
        let result = tables[table].filter((r) => matchesFilters(r, filters))
        if (notInFilter) {
          const [key, ids] = notInFilter
          result = result.filter((r) => !ids.includes(r[key] as string))
        }
        if (notNullKey) {
          result = result.filter((r) => r[notNullKey as string] != null)
        }
        for (const [key, op, value] of rangeFilters) {
          result = result.filter((r) => {
            const a = r[key]
            if (a == null) return false
            return op === "lte" ? String(a) <= String(value) : String(a) >= String(value)
          })
        }
        return result.map((r) => withEmbeds(table, r))
      },
      select() {
        return builder
      },
      maybeSingle() {
        return Promise.resolve({ data: builder.rows()[0] ?? null, error: null })
      },
      single() {
        const row = builder.rows()[0]
        return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: "not found" } })
      },
      insert(row: Record<string, unknown>) {
        const id = `${table}_${nextId++}`
        const inserted = { id, ...row }
        tables[table].push(inserted)
        return { select: () => ({ single: () => Promise.resolve({ data: inserted, error: null }) }) }
      },
      update(patch: Record<string, unknown>) {
        const updateBuilder = {
          _filters: [] as [string, unknown][],
          eq(key: string, value: unknown) {
            this._filters.push([key, value])
            return this
          },
          in(key: string, values: unknown[]) {
            this._filters.push([key, values])
            return this
          },
          then(resolve: (v: { data: null; error: null }) => void) {
            for (const row of tables[table]) {
              if (matchesFilters(row, [...filters, ...this._filters])) Object.assign(row, patch)
            }
            resolve({ data: null, error: null })
          },
        }
        return updateBuilder
      },
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        resolve({ data: builder.rows(), error: null })
      },
    }
    return builder
  }

  const client = { from: (table: string) => queryBuilder(table) }
  return { client: client as never, tables }
}

const COMPANY = "co_1"

function seedBaseline(tables: Record<string, Record<string, unknown>[]>) {
  tables.companies.push({ id: COMPANY, document_expiry_warning_days: 30 })
}

beforeEach(() => {
  pricingAiMock.reviewPricingOutliers.mockClear()
})

describe("runOperationsFeedForCompany", () => {
  it("detects an idle vehicle, an expiring document, and overlapping reservations in one run; nothing for entities that don't warrant attention", async () => {
    const { client, tables } = makeFakeSupabase()
    seedBaseline(tables)

    tables.vehicles.push(
      { id: "veh_idle", company_id: COMPANY, make: "Dacia", model: "Duster", registration_number: "1-A-1", status: "available", created_at: "2026-01-01T00:00:00Z" },
      { id: "veh_busy", company_id: COMPANY, make: "Toyota", model: "Yaris", registration_number: "2-B-2", status: "rented", created_at: "2026-01-01T00:00:00Z" }
    )
    tables.reservations.push(
      // veh_idle: last completed return was 20 days ago, nothing upcoming -> idle.
      { id: "res_1", company_id: COMPANY, reference: "RB-1", status: "completed", pickup_at: "2026-06-27T10:00:00Z", return_at: "2026-07-01T10:00:00Z", daily_rate: 300, vehicle_id: "veh_idle", customer_id: "cus_1" },
      // veh_busy: two overlapping active/confirmed bookings.
      { id: "res_2", company_id: COMPANY, reference: "RB-2", status: "confirmed", pickup_at: "2026-07-20T10:00:00Z", return_at: "2026-07-25T10:00:00Z", daily_rate: 300, vehicle_id: "veh_busy", customer_id: "cus_2" },
      { id: "res_3", company_id: COMPANY, reference: "RB-3", status: "confirmed", pickup_at: "2026-07-22T10:00:00Z", return_at: "2026-07-27T10:00:00Z", daily_rate: 300, vehicle_id: "veh_busy", customer_id: "cus_3" }
    )
    tables.documents.push({
      id: "doc_1",
      company_id: COMPANY,
      category: "insurance_document",
      status: "active",
      expires_on: "2026-07-25",
      customer_id: null,
      vehicle_id: "veh_idle",
      reservation_id: null,
      original_filename: "insurance.pdf",
    })

    const now = new Date("2026-07-21T12:00:00Z")
    const summary = await runOperationsFeedForCompany(client, COMPANY, now)

    expect(summary.opened).toBe(3) // idle vehicle, expiring document, one overlap
    const items = tables.operations_feed_items
    expect(items.find((i) => i.observer_type === "idle_vehicle")).toBeTruthy()
    expect(items.find((i) => i.observer_type === "expiring_document")).toBeTruthy()
    expect(items.find((i) => i.observer_type === "overlapping_reservations")).toBeTruthy()
    // veh_busy is rented, not available, so it never triggers idle_vehicle.
    expect(items.some((i) => i.observer_type === "idle_vehicle" && i.entity_id === "veh_busy")).toBe(false)
  })

  it("clears the idle-vehicle item once the vehicle gets booked (acceptance criterion)", async () => {
    const { client, tables } = makeFakeSupabase()
    seedBaseline(tables)
    tables.vehicles.push({ id: "veh_idle", company_id: COMPANY, make: "Dacia", model: "Duster", registration_number: "1-A-1", status: "available", created_at: "2026-01-01T00:00:00Z" })
    tables.reservations.push({ id: "res_1", company_id: COMPANY, reference: "RB-1", status: "completed", pickup_at: "2026-06-27T10:00:00Z", return_at: "2026-07-01T10:00:00Z", daily_rate: 300, vehicle_id: "veh_idle", customer_id: "cus_1" })

    const now = new Date("2026-07-21T12:00:00Z")
    const firstRun = await runOperationsFeedForCompany(client, COMPANY, now)
    expect(firstRun.opened).toBe(1)
    const openItem = tables.operations_feed_items.find((i) => i.observer_type === "idle_vehicle")!
    expect(openItem.status).toBe("open")

    // The vehicle gets a fresh upcoming booking — no longer idle.
    tables.reservations.push({ id: "res_2", company_id: COMPANY, reference: "RB-2", status: "confirmed", pickup_at: "2026-07-23T10:00:00Z", return_at: "2026-07-26T10:00:00Z", daily_rate: 300, vehicle_id: "veh_idle", customer_id: "cus_2" })

    const secondRun = await runOperationsFeedForCompany(client, COMPANY, now)
    expect(secondRun.opened).toBe(0)
    expect(secondRun.resolved).toBe(1)
    const resolvedItem = tables.operations_feed_items.find((i) => i.observer_type === "idle_vehicle")!
    expect(resolvedItem.status).toBe("resolved")
    expect(resolvedItem.resolved_at).toBeTruthy()
  })

  it("leaves a dismissed item untouched while the condition still holds, and never re-flags it as open", async () => {
    const { client, tables } = makeFakeSupabase()
    seedBaseline(tables)
    tables.vehicles.push({ id: "veh_idle", company_id: COMPANY, make: "Dacia", model: "Duster", registration_number: "1-A-1", status: "available", created_at: "2026-01-01T00:00:00Z" })
    tables.reservations.push({ id: "res_1", company_id: COMPANY, reference: "RB-1", status: "completed", pickup_at: "2026-06-27T10:00:00Z", return_at: "2026-07-01T10:00:00Z", daily_rate: 300, vehicle_id: "veh_idle", customer_id: "cus_1" })

    const now = new Date("2026-07-21T12:00:00Z")
    await runOperationsFeedForCompany(client, COMPANY, now)
    const item = tables.operations_feed_items.find((i) => i.observer_type === "idle_vehicle")!
    item.status = "dismissed"
    item.dismissed_at = now.toISOString()
    const dismissedSnapshot = JSON.stringify(item)

    // Nothing about the underlying condition changed — still idle.
    const secondRun = await runOperationsFeedForCompany(client, COMPANY, now)
    expect(secondRun.opened).toBe(0)
    expect(secondRun.updated).toBe(0)
    expect(secondRun.resolved).toBe(0)
    expect(JSON.stringify(tables.operations_feed_items.find((i) => i.observer_type === "idle_vehicle"))).toBe(dismissedSnapshot)
  })
})
