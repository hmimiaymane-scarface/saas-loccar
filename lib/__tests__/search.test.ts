import { describe, expect, it, vi } from "vitest"

const documentsMock = vi.hoisted(() => ({ searchDocumentIdsByExtractedFields: vi.fn(async () => [] as string[]) }))
vi.mock("@/lib/documents", () => documentsMock)

import { globalSearch, groupSearchResultsByType, type SearchResult } from "../search"

interface Row {
  [key: string]: unknown
}

/** A small, purpose-built fake — supports exactly the chain shapes
 * `lib/search.ts` calls (`select/eq/ilike/or/in/limit`, each table's
 * embedded `customer` field baked directly into the fixture row rather
 * than simulated via a real FK join), not a general-purpose mock. */
function makeFakeSupabase(tables: Record<string, Row[]>) {
  function builder(table: string) {
    let rows = [...(tables[table] ?? [])]
    let limitN: number | null = null

    function matchesIlike(row: Row, key: string, pattern: string): boolean {
      const needle = pattern.replace(/^%|%$/g, "").replace(/\\(.)/g, "$1").toLowerCase()
      return String(row[key] ?? "").toLowerCase().includes(needle)
    }

    const api = {
      select() {
        return api
      },
      eq(key: string, value: unknown) {
        // Fixtures don't bother declaring company_id/status on every row
        // — this suite is about fragment-matching logic, not tenant
        // scoping (covered separately by cross-tenant-isolation.test.ts).
        // A row that doesn't declare the filtered key at all passes
        // through unfiltered; a row that does must match it.
        rows = rows.filter((r) => (key in r ? r[key] === value : true))
        return api
      },
      ilike(key: string, pattern: string) {
        rows = rows.filter((r) => matchesIlike(r, key, pattern))
        return api
      },
      or(expr: string) {
        const clauses = expr.split(",").map((clause) => {
          const match = clause.match(/^(\w+)\.ilike\.(.*)$/)
          if (!match) return () => false
          const [, key, pattern] = match
          return (r: Row) => matchesIlike(r, key, pattern)
        })
        rows = rows.filter((r) => clauses.some((c) => c(r)))
        return api
      },
      in(key: string, values: unknown[]) {
        rows = rows.filter((r) => values.includes(r[key]))
        return api
      },
      limit(n: number) {
        limitN = n
        return api
      },
      then(resolve: (result: { data: Row[]; error: null }) => void) {
        resolve({ data: limitN != null ? rows.slice(0, limitN) : rows, error: null })
      },
    }
    return api
  }

  return { from: builder } as unknown as Parameters<typeof globalSearch>[0]
}

const EMPTY_TABLES = { vehicles: [], customers: [], reservations: [], contracts: [], documents: [], company_memberships: [] }

describe("globalSearch", () => {
  it("returns nothing for a query shorter than 2 characters", async () => {
    const supabase = makeFakeSupabase(EMPTY_TABLES)
    expect(await globalSearch(supabase, "co_1", "a")).toEqual([])
  })

  it("finds a customer by a phone fragment (not just a prefix)", async () => {
    const supabase = makeFakeSupabase({
      ...EMPTY_TABLES,
      customers: [{ id: "cus_1", full_name: "Ahmed Tazi", phone: "+212612345678" }],
    })
    const results = await globalSearch(supabase, "co_1", "5678")
    expect(results).toEqual([{ type: "customer", id: "cus_1", title: "Ahmed Tazi", subtitle: "+212612345678", href: "/customers/cus_1" }])
  })

  it("finds a vehicle by a mid-plate fragment", async () => {
    const supabase = makeFakeSupabase({
      ...EMPTY_TABLES,
      vehicles: [{ id: "veh_1", make: "Dacia", model: "Duster", registration_number: "31567-A-6" }],
    })
    const results = await globalSearch(supabase, "co_1", "31567")
    expect(results).toEqual([{ type: "vehicle", id: "veh_1", title: "Dacia Duster", subtitle: "31567-A-6", href: "/fleet/veh_1" }])
  })

  it("finds a reservation by reference and a contract by contract number", async () => {
    const supabase = makeFakeSupabase({
      ...EMPTY_TABLES,
      reservations: [{ id: "res_1", reference: "RB-3391", customer: { full_name: "Ahmed Tazi" } }],
      contracts: [{ id: "con_1", contract_number: "CT-3391", customer: { full_name: "Ahmed Tazi" } }],
    })
    const results = await globalSearch(supabase, "co_1", "3391")
    expect(results).toEqual([
      { type: "reservation", id: "res_1", title: "RB-3391", subtitle: "Ahmed Tazi", href: "/reservations/res_1" },
      { type: "contract", id: "con_1", title: "CT-3391", subtitle: "Ahmed Tazi", href: "/contracts/con_1" },
    ])
  })

  it("matches a document by filename or by category", async () => {
    const supabase = makeFakeSupabase({
      ...EMPTY_TABLES,
      documents: [
        { id: "doc_1", original_filename: "passport_scan.jpg", category: "identity_document" },
        { id: "doc_2", original_filename: "licence.pdf", category: "driving_licence" },
      ],
    })
    const results = await globalSearch(supabase, "co_1", "licence")
    expect(results.map((r) => r.id)).toEqual(["doc_2"])
  })

  it("also matches a document by an extracted field value, via searchDocumentIdsByExtractedFields", async () => {
    documentsMock.searchDocumentIdsByExtractedFields.mockResolvedValueOnce(["doc_3"])
    const supabase = makeFakeSupabase({
      ...EMPTY_TABLES,
      documents: [{ id: "doc_3", original_filename: "scan_004.jpg", category: "identity_document" }],
    })
    const results = await globalSearch(supabase, "co_1", "BK204471")
    expect(results).toEqual([{ type: "document", id: "doc_3", title: "scan_004.jpg", subtitle: "identity_document", href: "/documents" }])
  })

  it("does not duplicate a document that matches both filename and extracted fields", async () => {
    documentsMock.searchDocumentIdsByExtractedFields.mockResolvedValueOnce(["doc_4"])
    const supabase = makeFakeSupabase({
      ...EMPTY_TABLES,
      documents: [{ id: "doc_4", original_filename: "bk204471_scan.jpg", category: "identity_document" }],
    })
    const results = await globalSearch(supabase, "co_1", "bk204471")
    expect(results).toHaveLength(1)
  })

  it("finds an employee by full name via the in-memory filter", async () => {
    const supabase = makeFakeSupabase({
      ...EMPTY_TABLES,
      company_memberships: [{ user_id: "u1", profile: { full_name: "Youssef El Amrani" } }],
    })
    const results = await globalSearch(supabase, "co_1", "youssef")
    expect(results).toEqual([{ type: "employee", id: "u1", title: "Youssef El Amrani", subtitle: "Team member", href: "/employees" }])
  })
})

describe("groupSearchResultsByType", () => {
  const make = (type: SearchResult["type"], id: string): SearchResult => ({ type, id, title: id, subtitle: "", href: "#" })

  it("groups results by type in a fixed presentation order, dropping empty groups", () => {
    const groups = groupSearchResultsByType([make("employee", "e1"), make("vehicle", "v1"), make("vehicle", "v2"), make("customer", "c1")])
    expect(groups.map((g) => g.type)).toEqual(["vehicle", "customer", "employee"])
    expect(groups.find((g) => g.type === "vehicle")?.results).toHaveLength(2)
  })

  it("returns no groups for an empty result list", () => {
    expect(groupSearchResultsByType([])).toEqual([])
  })
})
