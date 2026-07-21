import { describe, expect, it } from "vitest"

import {
  getInactiveCustomers,
  getFrequentCategoryRenters,
  getUpcomingBirthdays,
  isBirthdayWithinDays,
} from "@/lib/customer-segments"

function recordingChainable(result: { data: unknown; error: unknown }, calls: { method: string; args: unknown[] }[]) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        const promise = Promise.resolve(result)
        return promise.then.bind(promise)
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
        return proxy
      }
    },
  }
  const proxy = new Proxy({}, handler)
  return proxy
}

function makeFakeSupabase(responses: Partial<Record<string, { data: unknown; error: unknown }>> = {}) {
  const callsByTable: Record<string, { method: string; args: unknown[] }[]> = {}
  const client = {
    from(table: string) {
      callsByTable[table] = callsByTable[table] ?? []
      return recordingChainable(responses[table] ?? { data: [], error: null }, callsByTable[table])
    },
  }
  return { client, callsByTable }
}

function hasConsentFilter(calls: { method: string; args: unknown[] }[]): boolean {
  return calls.some((c) => c.method === "eq" && c.args[0] === "marketing_consent" && c.args[1] === true)
}

describe("getInactiveCustomers", () => {
  it("filters on marketing_consent = true", async () => {
    const { client, callsByTable } = makeFakeSupabase({
      reservations: { data: [], error: null },
      customers: { data: [], error: null },
    })
    await getInactiveCustomers(client as never, "co_1", 6)
    expect(hasConsentFilter(callsByTable.customers)).toBe(true)
  })

  it("returns a consented customer who rented before but not recently, and excludes a recently-active one", async () => {
    const now = new Date("2026-07-27T00:00:00.000Z")
    const responses: Partial<Record<string, { data: unknown; error: unknown }>> = {
      customers: {
        data: [
          { id: "cus_lapsed", full_name: "Lapsed Customer", phone: "1", email: null },
          { id: "cus_never", full_name: "Never Rented", phone: "2", email: null },
        ],
        error: null,
      },
    }
    let call = 0
    const client = {
      from(table: string) {
        if (table === "reservations") {
          call++
          // First call: recent reservations (within window) -> only cus_recent (not in customers result anyway).
          // Second call: all-time reservations -> cus_lapsed and cus_recent have history.
          const data = call === 1 ? [{ customer_id: "cus_recent" }] : [{ customer_id: "cus_lapsed" }, { customer_id: "cus_recent" }]
          return recordingChainable({ data, error: null }, [])
        }
        return recordingChainable(responses[table] ?? { data: [], error: null }, [])
      },
    }

    const result = await getInactiveCustomers(client as never, "co_1", 6, now)

    expect(result.map((r) => r.customerId)).toEqual(["cus_lapsed"])
  })
})

describe("getFrequentCategoryRenters", () => {
  it("filters on marketing_consent = true", async () => {
    const { client, callsByTable } = makeFakeSupabase({
      reservations: {
        data: [
          { customer_id: "cus_1", vehicle: { category: "suv" } },
          { customer_id: "cus_1", vehicle: { category: "suv" } },
          { customer_id: "cus_1", vehicle: { category: "suv" } },
        ],
        error: null,
      },
      customers: { data: [], error: null },
    })
    await getFrequentCategoryRenters(client as never, "co_1", "suv", 3)
    expect(hasConsentFilter(callsByTable.customers)).toBe(true)
  })

  it("only includes customers meeting the minimum reservation count for that category", async () => {
    const client = {
      from(table: string) {
        if (table === "reservations") {
          return recordingChainable(
            {
              data: [
                { customer_id: "cus_frequent", vehicle: { category: "suv" } },
                { customer_id: "cus_frequent", vehicle: { category: "suv" } },
                { customer_id: "cus_frequent", vehicle: { category: "suv" } },
                { customer_id: "cus_occasional", vehicle: { category: "suv" } },
                { customer_id: "cus_frequent", vehicle: { category: "economy" } }, // wrong category, not counted
              ],
              error: null,
            },
            []
          )
        }
        return recordingChainable(
          { data: [{ id: "cus_frequent", full_name: "Frequent Renter", phone: "1", email: null }], error: null },
          []
        )
      },
    }

    const result = await getFrequentCategoryRenters(client as never, "co_1", "suv", 3)

    expect(result.map((r) => r.customerId)).toEqual(["cus_frequent"])
  })

  it("returns [] without querying customers when nobody qualifies", async () => {
    let customersQueried = false
    const client = {
      from(table: string) {
        if (table === "reservations") return recordingChainable({ data: [], error: null }, [])
        customersQueried = true
        return recordingChainable({ data: [], error: null }, [])
      },
    }
    const result = await getFrequentCategoryRenters(client as never, "co_1", "suv", 3)
    expect(result).toEqual([])
    expect(customersQueried).toBe(false)
  })
})

describe("getUpcomingBirthdays", () => {
  it("filters on marketing_consent = true and excludes customers with no date_of_birth", async () => {
    const { client, callsByTable } = makeFakeSupabase({ customers: { data: [], error: null } })
    await getUpcomingBirthdays(client as never, "co_1", 30)
    expect(hasConsentFilter(callsByTable.customers)).toBe(true)
    expect(callsByTable.customers.some((c) => c.method === "not" && c.args[0] === "date_of_birth")).toBe(true)
  })

  it("only returns customers whose birthday falls in the window", async () => {
    const now = new Date("2026-07-27T00:00:00.000Z")
    const client = {
      from() {
        return recordingChainable(
          {
            data: [
              { id: "cus_soon", full_name: "Birthday Soon", phone: "1", email: null, date_of_birth: "1990-07-30" },
              { id: "cus_far", full_name: "Birthday Far", phone: "2", email: null, date_of_birth: "1990-01-15" },
            ],
            error: null,
          },
          []
        )
      },
    }

    const result = await getUpcomingBirthdays(client as never, "co_1", 5, now)

    expect(result.map((r) => r.customerId)).toEqual(["cus_soon"])
  })
})

describe("isBirthdayWithinDays", () => {
  const now = new Date("2026-07-27T00:00:00.000Z")

  it("is true for today's birthday", () => {
    expect(isBirthdayWithinDays("1990-07-27", 5, now)).toBe(true)
  })

  it("respects the window boundary", () => {
    expect(isBirthdayWithinDays("1990-07-30", 5, now)).toBe(true)
    expect(isBirthdayWithinDays("1990-07-30", 2, now)).toBe(false)
  })

  it("is false for a birthday already passed this year (rolls to next year, far outside the window)", () => {
    expect(isBirthdayWithinDays("1990-07-20", 30, now)).toBe(false)
  })

  it("handles the December-into-January wraparound", () => {
    const decNow = new Date("2026-12-28T00:00:00.000Z")
    expect(isBirthdayWithinDays("1990-01-03", 10, decNow)).toBe(true)
    expect(isBirthdayWithinDays("1990-01-03", 5, decNow)).toBe(false)
  })
})
